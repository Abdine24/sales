# Certificat TLS wildcard pour `*.azanga.tech`

Nécessaire pour `nginx-frontend.conf` (chaque sous-domaine de boutique). Contrairement à
`api.azanga.tech` (un nom exact, où `certbot --nginx -d api.azanga.tech` suffit — validation
HTTP-01), un certificat **wildcard** exige une validation **DNS-01** : Let's Encrypt demande de
poser un enregistrement TXT temporaire sur `azanga.tech`, pas de répondre sur un port 80/443.

## Option A — Manuel (le plus simple pour démarrer)

```bash
sudo certbot certonly --manual --preferred-challenges dns \
  -d "azanga.tech" -d "*.azanga.tech" \
  --cert-name azanga.tech-wildcard
```

Certbot affiche une valeur à poser en `TXT` sur `_acme-challenge.azanga.tech` — ajoute-la dans
le panneau DNS Hostinger, attends la propagation (`dig TXT _acme-challenge.azanga.tech` doit
la montrer), puis continue (Entrée). Le certificat est valable 90 jours.

**Limite** : ce mode manuel ne se renouvelle pas tout seul (`certbot renew` échouera sans
intervention) — il faudra recommencer cette manip tous les ~3 mois tant que l'option B n'est
pas mise en place.

## Option B — Automatisé (à faire quand le renouvellement manuel devient pénible)

Un plugin DNS-01 certbot pour Hostinger n'est pas un plugin officiel standard. Deux pistes :

- Un hook certbot personnalisé (`--manual-auth-hook`/`--manual-cleanup-hook`) qui pose/retire
  le TXT via l'API DNS de Hostinger (disponible — voir la documentation Hostinger API),
  déclenché automatiquement par `certbot renew`.
- Basculer la gestion DNS de `azanga.tech` vers un fournisseur ayant un plugin certbot DNS-01
  officiel (Cloudflare, par ex., avec `certbot-dns-cloudflare`) — change juste où le DNS est
  géré, pas où le site est hébergé.

Pas construit dans cette itération — l'option A suffit pour valider le reste de
l'infrastructure multi-tenant avant d'investir dans l'automatisation.

---

# Bascule complète vers le multi-tenant — checklist VPS

À dérouler dans cet ordre (voir le plan multi-tenant pour le détail de chaque étape) :

1. **Base de contrôle** :
   ```bash
   cd /docker/vente-api
   docker compose exec postgres psql -U vente -d vente -c "create database control_plane;"
   docker compose pull && docker compose up -d   # nouvelle image API avec controlPlaneSchema.sql
   docker compose logs --tail=20 api              # doit démarrer sans erreur
   ```
   Aucune nouvelle variable d'environnement requise — `db.js` dérive control_plane, chaque
   base boutique, et la connexion de maintenance directement de `DATABASE_URL` déjà en place.

2. **Enregistrer la boutique actuelle comme premier tenant** (réutilise la base `vente`
   existante telle quelle, ne supprime rien) :
   ```bash
   docker compose exec postgres psql -U vente -d control_plane -c \
     "insert into boutiques (slug, nom, db_name, status, provisioned_at) values ('principale', 'Boutique principale', 'vente', 'active', now());"
   ```

3. **Redéployer l'API** (contient déjà le refactor tenant à ce stade — image reconstruite via
   `.github/workflows/deploy-api.yml`) :
   ```bash
   docker compose pull && docker compose up -d
   ```
   Le filet de sécurité transitoire (en-tête `X-Tenant-Host` absent -> boutique `principale`,
   voir `tenantResolver.js`) garde les utilisateurs actuels connectés pendant que le frontend
   se redéploie séparément sur GitHub Pages.

4. **Déployer le frontend** — se fait automatiquement au push sur `main`
   (`.github/workflows/deploy.yml`). Vérifier que la boutique `principale` fonctionne toujours
   normalement une fois en ligne (elle enverra désormais l'en-tête `X-Tenant-Host`, donc le
   filet de sécurité de l'étape 3 ne sera même plus sollicité pour elle).

5. **Tester le provisioning avant le DNS/TLS** — sans attendre le sous-domaine réel :
   ```bash
   curl -X POST https://api.azanga.tech/boutiques \
     -H "Content-Type: application/json" \
     -d '{"nom":"Boutique Test","slug":"test-a"}'
   ```
   Puis simuler la connexion en local avec `?tenant=test-a` dans l'URL (voir
   `src/services/tenant.ts`), ou avec un en-tête `X-Tenant-Host: test-a.azanga.tech` manuel
   via curl/Postman contre les routes `/personnel/me` etc.

6. **DNS + TLS wildcard + `nginx-frontend.conf`** (voir plus haut) — en dernier,
   volontairement : c'est la partie la plus dépendante de l'extérieur, la moins risquée côté
   code. Ajouter le DNS wildcard `*.azanga.tech -> <IP du VPS>` chez Hostinger, obtenir le
   certificat (option A ci-dessus), installer `nginx-frontend.conf`.

7. **Vérification finale** : répéter le test de l'étape 5 via le vrai sous-domaine
   `test-a.azanga.tech`, confirmer l'isolation (voir le plan, section Vérification) avant
   d'annoncer l'inscription libre-service publiquement.
