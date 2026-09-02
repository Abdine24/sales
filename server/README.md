# API iVente (VPS)

API backend pour toutes les données métier (produits, ventes, clients, stock, personnel...),
hébergée sur le VPS Hostinger (`api.azanga.tech`). L'app est online-only : plus de Dexie/
IndexedDB côté client, toutes les pages passent par cette API.

Supabase reste responsable de l'authentification (inscription, connexion, réinitialisation de
mot de passe). Chaque requête envoyée ici porte le jeton Supabase de l'utilisateur
(`Authorization: Bearer <token>`), vérifié via le JWKS public de Supabase (`src/auth.js`) —
aucun secret Supabase à stocker côté VPS pour ça.

Exception : la gestion du personnel (création d'un employé avec mot de passe, changement de
mot de passe par l'admin) utilise la clé **service_role** de Supabase (`src/supabaseAdmin.js`)
pour agir sur les comptes au nom de l'admin — cette clé ne vit que dans l'environnement du
VPS, jamais dans le bundle envoyé au navigateur.

## Ressources

Toutes authentifiées sauf `/health` et `/licences/*` (appelées avant connexion) :
produits, categories, zones, fournisseurs, clients, personnel (+ `/me`, +
`/:id/mot-de-passe`), settings, licence, ventes (+ lignes), achats-stock, ajustements-stock,
retours, reglements, paniers-en-attente. Les écritures qui touchent plusieurs tables (vente,
retour, achat, ajustement, règlement) sont chacune une vraie transaction Postgres — voir
`src/db.js` (`withTransaction`) et les fichiers correspondants dans `src/routes/`.

## Développement local

```bash
cd server
npm install
DATABASE_URL=postgres://... SUPABASE_URL=https://cyzipoluiwvhgrizytll.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=... LICENSE_SECRET=... npm run dev
```

## Déploiement

Le VPS fait déjà tourner un Nginx (pour un bot Telegram + d'autres sites) qui occupe les
ports 80/443 — l'API ne les touche pas. Son conteneur n'expose que `127.0.0.1:3000`, et c'est
ce Nginx existant qui sert de reverse proxy HTTPS vers elle (voir `deploy/nginx-api.conf`).

1. Un push sur `main` touchant `server/**` déclenche `.github/workflows/deploy-api.yml`,
   qui construit l'image Docker et la publie sur `ghcr.io/abdine24/sales-api:latest`.
2. Le projet Docker Compose sur le VPS (`vente-api`, voir `deploy/docker-compose.yml`) est
   mis à jour via l'outil MCP `VPS_updateProjectV1` (récupère la nouvelle image).
3. Variables d'environnement fournies au déploiement (jamais dans le compose file lui-même) :
   `POSTGRES_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LICENSE_SECRET`.
