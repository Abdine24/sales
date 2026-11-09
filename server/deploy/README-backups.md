# Sauvegardes de la base Postgres (VPS)

Toutes les boutiques vivent dans **un seul** conteneur `postgres` et un seul volume Docker
(`pg_data`) : la base de contrôle `control_plane` + une base `tenant_<slug>` par boutique. Sans
sauvegarde, une erreur de manipulation, une mise à jour ratée ou un disque perdu = toutes les
boutiques perdues. Le service `backup` de `docker-compose.yml` s'en charge.

## Ce que fait le service `backup`

- **Une fois par jour** (à `BACKUP_TIME`, heure **UTC**, défaut `02:30`), un `pg_dump` de
  **chaque** base : `control_plane` + toutes les bases listées dans `control_plane.boutiques`
  (colonne `db_name`), y compris les boutiques suspendues.
- Format **custom compressé** (`pg_dump -Fc`), un fichier par base. Chaque fichier est relu
  (`pg_restore --list`) avant d'être validé, et un fichier `SHA256SUMS` est écrit à côté.
- Les rôles Postgres (`globals.sql`, sans mot de passe) sont aussi sauvegardés.
- **Rotation** : garde les `BACKUP_RETENTION_DAYS` derniers jours (défaut **14**). La rotation
  n'a lieu qu'après une sauvegarde **entièrement réussie** : si les sauvegardes échouent
  pendant des jours, les dernières bonnes ne sont jamais supprimées.
- **Copie hors du VPS, optionnelle** : si `BACKUP_REMOTE` est défini, les sauvegardes sont
  copiées avec `rclone` vers un stockage compatible S3. Sans cette variable, **rien ne sort du
  VPS** (copie locale uniquement).

Le service réutilise l'image de l'API (`ghcr.io/abdine24/sales-api`), qui embarque le script
(`server/backup/`), le client Postgres 16 et `rclone` : le projet Compose du VPS est créé à
partir du seul `docker-compose.yml`, il n'y a donc aucun fichier à copier à la main sur le VPS.

## 1. Activer (une seule fois)

1. Fusionner la PR, puis **attendre la fin** du workflow GitHub « Build & Push API image » :
   le service `backup` a besoin de la nouvelle image (sinon le conteneur redémarre en boucle
   faute de trouver `/app/backup/scheduler.sh`).
2. Mettre à jour le projet `vente-api` sur le VPS avec le nouveau `docker-compose.yml`
   (comme d'habitude, outil `VPS_updateProjectV1`). Aucune nouvelle variable n'est obligatoire :
   le service réutilise `POSTGRES_PASSWORD`.
3. Vérifier qu'il tourne, puis lancer **une première sauvegarde à la main** (depuis le dossier
   du projet sur le VPS, ex. `/docker/vente-api`) :
   ```bash
   docker compose logs backup
   docker compose exec backup sh /app/backup/pg-backup.sh
   ```
   La dernière ligne doit être `fin — N boutique(s) + control_plane, 0 échec(s) -> <dossier>`.

Variables optionnelles (paramètre `environment` du déploiement, comme les autres) :

| Variable | Défaut | Rôle |
|---|---|---|
| `BACKUP_TIME` | `02:30` | heure quotidienne de sauvegarde, **UTC**, format `HH:MM` |
| `BACKUP_RETENTION_DAYS` | `14` | nombre de jours de sauvegardes gardés sur le VPS |
| `BACKUP_REMOTE` | *(vide)* | destination rclone, voir § 3 — vide = pas de copie distante |
| `BACKUP_REMOTE_RETENTION_DAYS` | *(vide)* | si défini, supprime à distance ce qui a plus de N jours |

## 2. Où sont les fichiers

Dans le volume Docker `pg_backups`, monté sur `/backups` dans le conteneur `backup` :

```
/backups/
  2026-11-09_023000/          <- un dossier par sauvegarde (date et heure UTC)
    control_plane.dump
    tenant_boutiquea.dump
    tenant_ma-boutique.dump
    globals.sql
    SHA256SUMS
  2026-11-10_023000.ECHEC/    <- au moins une base a échoué (les autres dumps sont bons)
  last_success                <- date de la dernière sauvegarde 100 % réussie
```

Un dossier suffixé `.ECHEC` contient les bases qui ont réussi ; les erreurs sont dans
`docker compose logs backup`. Sur le disque du VPS, le volume se trouve en général dans
`/var/lib/docker/volumes/vente-api_pg_backups/_data` (`docker volume ls` pour le nom exact).

Commandes utiles :

```bash
docker compose exec backup sh -c 'cat /backups/last_success; ls -l /backups'
docker compose logs --tail 50 backup
# Récupérer un dump sur le VPS (hors volume), par ex. pour le télécharger ensuite en scp :
docker compose cp backup:/backups/2026-11-09_023000/tenant_boutiquea.dump ./
```

> **Attention** : ce volume est sur le **même disque** que la base. Il protège contre les
> erreurs (suppression, mise à jour ratée, base corrompue), **pas** contre la perte du VPS.
> Pour ça, activer la copie distante (§ 3).

## 3. Copie hors du VPS (optionnelle)

Rien n'est configuré par défaut. Pour l'activer, créer chez un fournisseur compatible S3
(Backblaze B2, Scaleway, Wasabi, OVH, AWS...) :

1. un bucket **privé** (idéalement avec une règle de cycle de vie ou le verrouillage d'objets,
   pour que même une clé volée ne puisse pas tout effacer) ;
2. une clé d'accès **limitée à ce bucket**.

Puis ajouter au déploiement (le nom de remote `offsite` est fixé dans le compose) :

| Variable | Exemple Backblaze B2 | Exemple Scaleway |
|---|---|---|
| `BACKUP_REMOTE` | `offsite:mon-bucket/ivente` | `offsite:mon-bucket/ivente` |
| `RCLONE_CONFIG_OFFSITE_PROVIDER` | `Other` | `Scaleway` |
| `RCLONE_CONFIG_OFFSITE_ENDPOINT` | `s3.eu-central-003.backblazeb2.com` | `s3.fr-par.scw.cloud` |
| `RCLONE_CONFIG_OFFSITE_REGION` | `eu-central-003` | `fr-par` |
| `RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID` | *(keyID)* | *(access key)* |
| `RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY` | *(applicationKey)* | *(secret key)* |

(Les valeurs exactes d'endpoint/région sont données par le fournisseur à la création du bucket.)
Les clés sont des secrets : uniquement dans le paramètre `environment` du déploiement, jamais
dans un fichier du dépôt.

Vérifier, puis forcer une sauvegarde :

```bash
docker compose exec backup sh -c 'rclone lsd "${BACKUP_REMOTE%%:*}:"'
docker compose exec backup sh /app/backup/pg-backup.sh
docker compose exec backup sh -c 'rclone ls "$BACKUP_REMOTE" | tail'
```

Fonctionnement : `rclone copy` (jamais `sync`) — rien n'est supprimé à distance, sauf si
`BACKUP_REMOTE_RETENTION_DAYS` est défini. Les jours où la copie a échoué sont rattrapés au
passage suivant. Les dumps ne sont **pas chiffrés** par le script et contiennent des données
personnelles (clients, téléphones, personnel) : le bucket doit rester privé.

## 4. RESTAURER une boutique

Cas typique : des données d'une boutique ont été effacées ou abîmées. Principe : on restaure le
dump **dans une base à côté**, on vérifie, puis on échange les deux bases. L'ancienne base est
**gardée** (renommée), rien n'est détruit.

> Tout ce qui a été saisi dans cette boutique **après** l'heure du dump sera absent de la base
> restaurée (l'ancienne base, gardée, permet de récupérer des lignes à la main si besoin).

Les commandes ci-dessous se lancent **dans le conteneur `backup`** (client Postgres 16, même
version que le serveur, déjà connecté à la base) :

```bash
docker compose exec backup sh
```

Dans ce shell (remplacer `tenant_boutiquea` et la date du dossier) :

```sh
B=tenant_boutiquea
D=/backups/2026-11-09_023000

# 1. Vérifier l'archive
cd "$D" && sha256sum -c SHA256SUMS && cd /

# 2. Restaurer dans une base temporaire, à côté de la vraie (la boutique continue de tourner)
psql -d postgres -c "create database \"${B}_restore\""
pg_restore --dbname="${B}_restore" --no-owner --exit-on-error "$D/$B.dump"

# 3. Contrôler le contenu restauré (exemples)
psql -d "${B}_restore" -c "select count(*) from ventes"
psql -d "${B}_restore" -c "select max(date) from ventes"
psql -d "${B}_restore" -c "select count(*) from clients"
```

Si le contenu est bon, **arrêter l'API** (depuis le VPS, dans un autre terminal) pour qu'elle
ne se reconnecte pas pendant l'échange — coupure de l'ordre d'une minute pour toutes les
boutiques :

```bash
docker compose stop api
```

Puis, de retour dans le shell du conteneur `backup` :

```sh
# 4. Échanger : la base abîmée est gardée sous <base>_old_<date>, la restaurée prend sa place
psql -d postgres -v ON_ERROR_STOP=1 \
  -c "select pg_terminate_backend(pid) from pg_stat_activity where datname in ('$B', '${B}_restore') and pid <> pg_backend_pid()" \
  -c "alter database \"$B\" rename to \"${B}_old_$(date -u +%Y%m%d)\"" \
  -c "alter database \"${B}_restore\" rename to \"$B\""
exit
```

```bash
docker compose start api
```

Vérifier la boutique dans l'app. Une fois sûr (quelques jours plus tard), supprimer
l'ancienne base :

```bash
docker compose exec backup psql -d postgres -c 'drop database "tenant_boutiquea_old_20261109"'
```

Si quelque chose ne va pas à l'étape 2 ou 3, il suffit de supprimer la base temporaire
(`drop database "tenant_boutiquea_restore"`) : la vraie base n'a pas été touchée.

**Restaurer `control_plane`** (annuaire des boutiques, comptes, licences) : même procédure avec
`B=control_plane`. Rarement nécessaire — et attention, les boutiques créées après le dump
n'y figureront plus (leurs bases `tenant_*` existent toujours, mais l'API ne les connaît plus).

**Dump venant de la copie distante** : le rapatrier d'abord dans le volume, puis même procédure
avec `D=/backups/rapatrie/2026-11-09_023000` :

```sh
rclone copy "$BACKUP_REMOTE/2026-11-09_023000" /backups/rapatrie/2026-11-09_023000
```

## 5. Tout reconstruire (VPS perdu ou volume `pg_data` détruit)

1. Redéployer le projet sur un VPS (même `docker-compose.yml`, même `POSTGRES_PASSWORD`), mais
   **sans démarrer l'API** tout de suite : `docker compose up -d postgres backup`.
2. Rapatrier le dernier dossier de sauvegarde complet (sans `.ECHEC`) depuis la copie distante :
   ```bash
   docker compose exec backup sh -c 'rclone lsf "$BACKUP_REMOTE" | tail -3'
   docker compose exec backup sh -c 'rclone copy "$BACKUP_REMOTE/2026-11-09_023000" /backups/2026-11-09_023000'
   ```
3. Recréer toutes les bases depuis les dumps (`--create` crée chaque base sous son nom
   d'origine — elles ne doivent pas déjà exister) :
   ```bash
   docker compose exec backup sh -c '
     D=/backups/2026-11-09_023000
     cd "$D" && sha256sum -c SHA256SUMS || exit 1
     for f in "$D"/control_plane.dump "$D"/tenant_*.dump; do
       echo "== $f"
       pg_restore --create --dbname=postgres --no-owner --exit-on-error "$f" || echo "ÉCHEC: $f"
     done'
   ```
   `globals.sql` n'est utile que si d'autres rôles que `vente` ont été créés à la main (le rôle
   `vente` est recréé par l'image à partir de `POSTGRES_PASSWORD`).
4. Démarrer l'API : `docker compose up -d`.

## 6. Tester régulièrement

Une sauvegarde jamais restaurée n'est pas une sauvegarde. Une fois par mois, faire les étapes
1 à 3 du § 4 sur une boutique (sans l'échange), comparer quelques chiffres avec l'app, puis
supprimer la base `_restore`.

## Versions

Toutes épinglées (aucun tag flottant `:16-alpine`, `:20-alpine`) :

| Composant | Version | Où |
|---|---|---|
| Serveur Postgres | `postgres:16.15-alpine3.23` | `deploy/docker-compose.yml` |
| Node.js (image API + backup) | `node:20.20.2-alpine3.23` | `server/Dockerfile` |
| Client `pg_dump` / `pg_restore` / `psql` | `postgresql16-client~16.15` (Alpine 3.23) | `server/Dockerfile` |
| rclone | `rclone~1.72` (Alpine 3.23) | `server/Dockerfile` |
| Dépendances npm de l'API | celles de `server/package-lock.json` (`npm ci`) | `server/Dockerfile` |

Règles :
- **Client = serveur** : `postgresql16-client` doit rester sur la même version que l'image
  `postgres`. Les changer ensemble.
- **Version mineure** (16.15 → 16.16) : simple changement de tag, sans risque pour les données.
- **Version majeure** (16 → 17) : **jamais** un simple changement de tag, le serveur ne
  démarrerait plus sur l'ancien volume. Il faut une migration (sauvegarde puis restauration
  dans un nouveau serveur, ou `pg_upgrade`), à préparer à part.
- Si le build CI échoue sur `apk add` (`postgresql16-client~16.15` ou `rclone~1.72`
  introuvable), c'est qu'Alpine a publié une version plus récente : mettre à jour le numéro
  dans le `Dockerfile` (et l'image `postgres` du compose pour le client Postgres).

## Notes techniques

- Un `pg_restore` plus récent que le serveur (ex. client Postgres 17/18 installé sur un autre
  poste) envoie `SET transaction_timeout`, inconnu de Postgres 16 : avec `--exit-on-error` la
  restauration s'arrête net. D'où l'intérêt de restaurer depuis le conteneur `backup`
  (client 16). Avec un client plus récent, retirer `--exit-on-error` et vérifier que c'est la
  seule erreur signalée.
- Une sauvegarde ne s'exécute jamais deux fois en même temps (verrou `/backups/.lock`). Un
  passage interrompu (conteneur arrêté en plein dump) est marqué `.ECHEC` au passage suivant.
- Script : `server/backup/pg-backup.sh` (un passage) et `server/backup/scheduler.sh` (boucle
  quotidienne, point d'entrée du conteneur).
