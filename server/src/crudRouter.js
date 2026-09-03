import { Router } from 'express';

// Fabrique un routeur CRUD simple (GET liste, POST, PUT, DELETE) pour les ressources dont
// les colonnes correspondent 1:1 aux champs envoyés par le client, sans logique métier
// particulière (categories, zones, fournisseurs...). `table` et `columns` sont toujours des
// constantes internes définies par le code serveur (jamais dérivées d'une requête cliente),
// donc l'interpolation directe dans le SQL ci-dessous n'est pas une injection : les seules
// valeurs qui viennent du client passent par des paramètres liés ($1, $2...).
// Chaque handler lit req.tenantPool (posé par tenantResolver.js) plutôt qu'un pool global —
// ce routeur est générique par boutique, jamais lié à une base précise à sa création.
export function crudRouter({ table, columns, requiredColumns = [], jsonColumns = [], orderBy = 'id asc' }) {
  const router = Router();

  const encode = (col, value) =>
    jsonColumns.includes(col) && value !== undefined && value !== null ? JSON.stringify(value) : value;

  router.get('/', async (req, res) => {
    const { rows } = await req.tenantPool.query(`select * from ${table} order by ${orderBy}`);
    res.json(rows);
  });

  router.post('/', async (req, res) => {
    const body = req.body || {};
    for (const col of requiredColumns) {
      if (body[col] === undefined || body[col] === null || body[col] === '') {
        return res.status(400).json({ error: `Le champ "${col}" est requis.` });
      }
    }
    // Seuls les champs réellement envoyés sont insérés — les autres gardent le DEFAULT de
    // la colonne (ex: total_dette=0, actif=true) au lieu d'être écrasés par NULL.
    const providedCols = columns.filter((c) => body[c] !== undefined);
    const placeholders = providedCols.map((_, i) => `$${i + 1}`);
    const insertSql = providedCols.length
      ? `insert into ${table} (${providedCols.join(',')}) values (${placeholders.join(',')}) returning *`
      : `insert into ${table} default values returning *`;
    const { rows } = await req.tenantPool.query(insertSql, providedCols.map((c) => encode(c, body[c])));
    res.status(201).json(rows[0]);
  });

  router.put('/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identifiant invalide.' });
    const body = req.body || {};
    // Mise à jour partielle : seuls les champs envoyés sont modifiés, les autres gardent
    // leur valeur actuelle (évite qu'un champ omis par le client ne soit écrasé par NULL).
    const providedCols = columns.filter((c) => body[c] !== undefined);
    if (providedCols.length === 0) {
      const { rows } = await req.tenantPool.query(`select * from ${table} where id=$1`, [id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Introuvable.' });
      return res.json(rows[0]);
    }
    const setClause = providedCols.map((c, i) => `${c}=$${i + 1}`).join(',');
    const { rows } = await req.tenantPool.query(
      `update ${table} set ${setClause} where id=$${providedCols.length + 1} returning *`,
      [...providedCols.map((c) => encode(c, body[c])), id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Introuvable.' });
    res.json(rows[0]);
  });

  router.delete('/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identifiant invalide.' });
    const { rowCount } = await req.tenantPool.query(`delete from ${table} where id=$1`, [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Introuvable.' });
    res.status(204).send();
  });

  return router;
}
