import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { pool } from './db.js';
import { requireAuth } from './auth.js';
import { produitsRouter } from './routes/produits.js';
import { licencesRouter } from './routes/licences.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
// Nécessaire derrière un reverse proxy (Nginx) pour que req.ip reflète le vrai visiteur
// (sinon le rate-limiting des routes /licences verrait toujours l'IP du proxy).
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Endpoint public — vérifie juste que l'API et la base répondent, pas d'auth requise
// (utilisé pour le monitoring et par Caddy).
app.get('/health', async (_req, res) => {
  try {
    await pool.query('select 1');
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'db_unreachable' });
  }
});

// Publique — appelée avant toute authentification (activation d'une boutique, écran
// de licence expirée...). Voir server/src/routes/licences.js pour le rate-limiting.
app.use('/licences', licencesRouter);

// Toutes les autres routes métier exigent un utilisateur Supabase authentifié.
app.use('/produits', requireAuth, produitsRouter);

const PORT = process.env.PORT || 3000;

async function applySchema() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
}

async function start() {
  await applySchema();
  app.listen(PORT, () => {
    console.log(`API iVente démarrée sur le port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("Échec du démarrage de l'API :", err);
  process.exit(1);
});
