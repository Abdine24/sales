import pg from 'pg';

const { Pool, types } = pg;

// node-postgres renvoie les colonnes numeric/decimal comme des STRINGS par défaut (pour ne
// jamais perdre de précision sur de très grands nombres) — mais tout le reste du code (agrégats
// serveur avec +=, formatCfa côté client, etc.) traite ces valeurs comme des nombres. Sans ce
// parseur, sommer plusieurs lignes fait de la concaténation de chaînes au lieu d'une addition
// (ex: "15000" + "7500" -> "150007500" au lieu de 22500), ce qui finit par produire des totaux
// faux voire "NaN F" à l'affichage dès qu'un total non purement numérique est re-parsé.
// OID 1700 = pg_type.numeric. Doit être fait avant toute requête — donc ici, au chargement du
// module, puisque tout le reste importe ce fichier.
types.setTypeParser(1700, (value) => (value === null ? null : parseFloat(value)));

// Multi-tenant : une base Postgres dédiée par boutique (voir tenantDb.js et
// controlPlaneDb.js), toutes sur le même serveur Postgres. DATABASE_URL (fournie par
// docker-compose) sert de gabarit — on ne fait que remplacer le nom de la base dans son
// chemin pour obtenir la connexion vers la base de contrôle, une base boutique, ou la base
// "postgres" (toujours présente, nécessaire pour CREATE DATABASE). Ça évite d'avoir à
// déclarer une variable d'environnement séparée par usage : un seul secret (utilisateur/mot
// de passe/hôte) à gérer sur le VPS, quel que soit le nombre de boutiques.
const BASE_DATABASE_URL = process.env.DATABASE_URL;
if (!BASE_DATABASE_URL) {
  throw new Error('DATABASE_URL manquant.');
}

function urlForDatabase(dbName) {
  const url = new URL(BASE_DATABASE_URL);
  url.pathname = `/${dbName}`;
  return url.toString();
}

const openPools = new Map(); // dbName -> Pool, pour ne jamais ouvrir deux pools vers la même base

// Pool vers une base Postgres nommée (boutique, base de contrôle, ou base "postgres" pour les
// opérations d'administration). Les pools sont mis en cache par nom de base — appeler
// plusieurs fois avec le même nom renvoie toujours le même Pool.
export function poolFor(dbName) {
  let pool = openPools.get(dbName);
  if (!pool) {
    pool = new Pool({ connectionString: urlForDatabase(dbName), max: 5 });
    pool.on('error', (err) => {
      // Erreur sur une connexion inactive du pool — ne doit jamais faire planter le process.
      console.error(`Erreur inattendue du pool Postgres (${dbName})`, err);
    });
    openPools.set(dbName, pool);
  }
  return pool;
}

export async function closePool(dbName) {
  const pool = openPools.get(dbName);
  if (!pool) return;
  openPools.delete(dbName);
  await pool.end().catch(() => {});
}

// Connexion d'administration : sert à CREATE DATABASE (impossible dans une transaction, et
// impossible depuis une connexion à la base qu'on est en train de créer) et, plus
// généralement, à toute opération qui doit s'exécuter en dehors du périmètre d'une boutique
// précise. "postgres" est la base de maintenance toujours présente sur un serveur Postgres.
export const maintenancePool = poolFor('postgres');

// Exécute `fn` dans une transaction Postgres réelle sur le pool donné (même connexion pour
// toutes les requêtes, BEGIN/COMMIT/ROLLBACK) — nécessaire pour les écritures qui touchent
// plusieurs tables de façon atomique (une vente + ses lignes + la décrémentation du stock,
// par exemple). Générique sur le pool depuis le passage au multi-tenant : chaque route
// l'appelle désormais via req.withTenantTransaction (voir tenantResolver.js), qui referme
// déjà sur le pool de la boutique courante.
export async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
