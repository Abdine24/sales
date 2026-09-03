import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { poolFor, withTransaction } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Base de contrôle multi-tenant — annuaire des boutiques, jamais de données métier.
// Voir controlPlaneSchema.sql.
export const controlPlanePool = poolFor('control_plane');

export const withControlPlaneTransaction = (fn) => withTransaction(controlPlanePool, fn);

export async function applyControlPlaneSchema() {
  const sql = fs.readFileSync(path.join(__dirname, 'controlPlaneSchema.sql'), 'utf8');
  await controlPlanePool.query(sql);
}
