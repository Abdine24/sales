import pg from 'pg';

const { Pool } = pg;

// Une seule connexion partagée pour toute l'API. DATABASE_URL est fournie par
// docker-compose (voir server/deploy/docker-compose.yml) — jamais commitée en clair.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  // Erreur sur une connexion inactive du pool — ne doit jamais faire planter le process.
  console.error('Erreur inattendue du pool Postgres', err);
});

// Exécute `fn` dans une transaction Postgres réelle (même connexion pour toutes les requêtes,
// BEGIN/COMMIT/ROLLBACK) — nécessaire pour les écritures qui touchent plusieurs tables de
// façon atomique (une vente + ses lignes + la décrémentation du stock, par exemple).
export async function withTransaction(fn) {
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
