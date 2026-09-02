# API iVente (VPS)

API backend pour les données métier (produits, ventes, clients, stock...), hébergée sur le
VPS Hostinger (`api.azanga.tech`). Supabase reste uniquement responsable de l'authentification
(inscription, connexion, réinitialisation de mot de passe) — chaque requête envoyée ici doit
porter le jeton Supabase de l'utilisateur (`Authorization: Bearer <token>`), vérifié via le
JWKS public de Supabase (`server/src/auth.js`) : aucun secret Supabase à stocker côté VPS.

## État actuel (phase 1)

Un seul module est branché de bout en bout pour valider le pipeline complet
(GitHub → image Docker → VPS → Postgres → Caddy/HTTPS → auth Supabase) :

- `GET /health` — public, vérifie que l'API et Postgres répondent.
- `GET/POST/PUT/DELETE /produits` — authentifié, CRUD complet.

Les autres ressources (clients, fournisseurs, ventes, lignes_vente, achats_stock, retours,
personnel, zones, categories, settings, licence) suivront le même patron
(`src/routes/<ressource>.js` + table dans `src/schema.sql`) une fois cette base validée.

## Développement local

```bash
cd server
npm install
DATABASE_URL=postgres://... SUPABASE_URL=https://cyzipoluiwvhgrizytll.supabase.co npm run dev
```

## Déploiement

Le VPS fait déjà tourner un Nginx (pour un bot Telegram + d'autres sites) qui occupe les
ports 80/443 — l'API ne les touche pas. Son conteneur n'expose que `127.0.0.1:3000`, et c'est
ce Nginx existant qui sert de reverse proxy HTTPS vers elle (voir `deploy/nginx-api.conf`).

1. Un push sur `main` touchant `server/**` déclenche `.github/workflows/deploy-api.yml`,
   qui construit l'image Docker et la publie sur `ghcr.io/abdine24/sales-api:latest`.
2. Le projet Docker Compose sur le VPS (`vente-api`, voir `deploy/docker-compose.yml`) est
   créé/mis à jour via les outils MCP `VPS_createNewProjectV1` / `VPS_updateProjectV1`.
3. **Une seule fois**, en SSH sur le VPS : ajouter le bloc Nginx de `deploy/nginx-api.conf`
   et lancer `certbot --nginx -d api.azanga.tech` (instructions dans ce fichier).

## Prochaine étape côté app

`src/App.tsx` et toutes les pages utilisent encore Dexie (IndexedDB) comme source de données.
La migration vers cette API se fera page par page (le plus simple d'abord), en remplaçant
`useLiveQuery(() => db.x...)` par des appels à un client API (`src/services/api.ts`, à créer),
et en supprimant Dexie, `useSync`/`pushToSyncQueue` une fois toutes les pages migrées.
