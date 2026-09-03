import pg from 'pg';

const { Pool, types } = pg;

// node-postgres renvoie les colonnes numeric/decimal comme des STRINGS par défaut (pour ne
// jamais perdre de précision sur de très grands nombres) — mais tout le reste du code (agrégats
// serveur avec +=, formatCfa côté client, etc.) traite ces valeurs comme des nombres. Sans ce
// parseur, sommer plusieurs lignes fait de la concaténation de chaînes au lieu d'une addition
// (ex: "15000" + "7500" -> "150007500" au lieu de 22500), ce qui finit par produire des totaux
// faux voire "NaN F" à l'affichage dès qu'un total non purement numérique est re-parsé.
// OID 1700 = pg_type.numeric. Doit être fait avant toute requête — donc ici, au chargement du
// module, puisque tout le reste importe `pool` depuis ce fichier.
types.setTypeParser(1700, (value) => (value === null ? null : parseFloat(value)));

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
