# Mises à jour automatiques de l'app Electron installée

L'app desktop (`npm run electron:build`) vérifie au démarrage (puis toutes les 4h) si une
nouvelle version est disponible, la télécharge en arrière-plan, puis affiche un bouton
**"Mise à jour prête — Redémarrer"** à côté de la Licence (Réglages) — l'utilisateur choisit
le moment (voir `src/components/LicenceSection.tsx`, `electron/main.cjs`).

Le fichier `package.json` (`build.publish`) pointe vers **ton propre VPS**
(`https://api.azanga.tech/app-updates/`) plutôt que vers GitHub Releases — le repo étant privé,
utiliser GitHub aurait obligé à embarquer un token d'accès dans chaque app installée (le token
serait alors extractible par n'importe quel utilisateur), ce qu'on évite complètement ainsi.

## 1. Installation une seule fois sur le VPS

```bash
sudo mkdir -p /docker/vente-api/app-updates
sudo chown $USER:$USER /docker/vente-api/app-updates
```

Ajoute ce bloc dans la config Nginx existante de `api.azanga.tech`
(`/etc/nginx/sites-available/api.azanga.tech`, dans le(s) bloc(s) `server` — certbot en a
probablement créé un pour le port 443 en plus de celui du port 80 ; ajoute le bloc dans les
deux, ou au moins dans celui en 443 qui sert le trafic réel) :

```nginx
location /app-updates/ {
    alias /docker/vente-api/app-updates/;
    autoindex off;
}
```

Place-le **avant** le `location /` existant (qui proxy vers l'API Docker) — Nginx choisit le
préfixe le plus spécifique, donc l'ordre n'a normalement pas d'importance ici, mais autant être
explicite. Puis :

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Aucun nouveau sous-domaine, aucun nouveau certificat : `api.azanga.tech` est déjà couvert par le
certificat TLS existant.

## 2. Publier une nouvelle version (à chaque release)

1. Monte le numéro de version dans `package.json` (`"version": "1.0.1"`, etc. — suit le
   [semver](https://semver.org/lang/fr/), obligatoire pour qu'`electron-updater` compare
   correctement les versions).
2. Construis l'installeur :
   ```bash
   npm run electron:build
   ```
   Produit dans `release/` : `iVente Pro Setup <version>.exe`, `latest.yml`, et un
   `.exe.blockmap` (mise à jour différentielle — évite de re-télécharger tout l'installeur à
   chaque fois).
3. Envoie ces 3 fichiers vers le VPS, dans le dossier créé à l'étape 1 (adapte `user@host`) :
   ```bash
   scp release/latest.yml release/*.exe release/*.blockmap user@ton-vps:/docker/vente-api/app-updates/
   ```
   **Important** : ne laisse jamais deux versions différentes en même temps dans ce dossier —
   supprime l'ancien `.exe`/`.blockmap` avant d'envoyer les nouveaux (`latest.yml` référence un
   seul fichier à la fois ; un vieux `.exe` qui traîne ne gêne rien tant que `latest.yml` ne le
   cite plus, mais autant nettoyer).

Dans la minute qui suit (ou dans les 4h si l'app était déjà ouverte), les copies installées
détectent la nouvelle version, la téléchargent en tâche de fond, et proposent le bouton de
redémarrage — sans qu'aucun admin de boutique n'ait à aller chercher un fichier lui-même.

## Notes

- Pas de signature de code (le projet n'a pas de certificat — `CSC_IDENTITY_AUTO_DISCOVERY=false`
  dans `electron:build`) : Windows SmartScreen avertit à l'installation initiale, comme
  aujourd'hui. La mise à jour elle-même reste fiable car `electron-updater` vérifie l'intégrité
  du fichier téléchargé via le hash embarqué dans `latest.yml`, généré automatiquement par
  `electron-builder` à la construction.
- Le check ne s'exécute qu'en version empaquetée (`app.isPackaged`) — `npm run electron:dev` ne
  déclenche jamais de vérification, pas besoin de `latest.yml` local en développement.
