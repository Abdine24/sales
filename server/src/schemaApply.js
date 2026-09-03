import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TENANT_SCHEMA_SQL = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

// Applique le schéma métier (schema.sql — produits, ventes, personnel, licence...) à une base
// boutique donnée. Utilisé au provisioning d'une nouvelle boutique (voir routes/boutiques.js)
// et, si schema.sql évolue plus tard (nouvelle colonne/table), pourrait être rejoué
// manuellement contre une boutique déjà existante — chaque instruction du fichier est
// idempotente (CREATE TABLE IF NOT EXISTS / ALTER TABLE ... ADD COLUMN IF NOT EXISTS).
export async function applySchemaToTenant(pool) {
  await pool.query(TENANT_SCHEMA_SQL);
}
