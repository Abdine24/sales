import { poolFor, closePool, withTransaction } from './db.js';

// Pools par boutique — créés à la demande au premier accès, jamais tous ouverts d'un coup.
// poolFor() (db.js) met déjà en cache par nom de base ; on ne garde ici que la date de
// dernier usage, pour purger les pools inactifs plutôt que de laisser le nombre de
// connexions ouvertes croître avec le nombre de boutiques déjà visitées un jour, au lieu du
// nombre de boutiques réellement actives.
const lastUsedAt = new Map(); // dbName -> timestamp

const IDLE_MS = 30 * 60_000; // 30 min sans requête -> pool fermé
const SWEEP_INTERVAL_MS = 5 * 60_000;

export function getTenantPool(dbName) {
  lastUsedAt.set(dbName, Date.now());
  return poolFor(dbName);
}

const sweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [dbName, ts] of lastUsedAt) {
    if (now - ts > IDLE_MS) {
      lastUsedAt.delete(dbName);
      closePool(dbName);
    }
  }
}, SWEEP_INTERVAL_MS);
sweepTimer.unref(); // ne doit jamais empêcher le process de s'arrêter proprement

export const withTenantTransaction = (pool, fn) => withTransaction(pool, fn);
