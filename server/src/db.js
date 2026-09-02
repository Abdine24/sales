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
