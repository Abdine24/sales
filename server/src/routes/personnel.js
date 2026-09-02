import { Router } from 'express';
import { pool } from '../db.js';

export const personnelRouter = Router();

const RANDOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0/O/1/I

const generateIdentifiant = () => {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => RANDOM_ALPHABET[b % RANDOM_ALPHABET.length]).join('');
};

const generateUniqueIdentifiant = async () => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const identifiant = generateIdentifiant();
    const { rows } = await pool.query('select 1 from personnel where identifiant=$1', [identifiant]);
    if (rows.length === 0) return identifiant;
  }
  throw new Error("Impossible de générer un identifiant unique — réessaie.");
};

personnelRouter.get('/', async (_req, res) => {
  const { rows } = await pool.query('select * from personnel order by nom asc');
  res.json(rows);
});

// Résout le profil métier (rôle, zone...) de l'utilisateur Supabase actuellement authentifié.
// Renvoie 404 si le jeton Supabase est valide mais qu'aucun profil local n'a encore été créé
// pour cet utilisateur (ex: compte tout juste activé).
personnelRouter.get('/me', async (req, res) => {
  const { rows } = await pool.query(
    'select * from personnel where supabase_user_id=$1 or (email=$2 and supabase_user_id is null)',
    [req.user.id, req.user.email]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Aucun profil personnel pour ce compte.' });
  // Rattrape les comptes créés avant la liaison supabase_user_id.
  if (!rows[0].supabase_user_id) {
    await pool.query('update personnel set supabase_user_id=$1 where id=$2', [req.user.id, rows[0].id]);
    rows[0].supabase_user_id = req.user.id;
  }
  res.json(rows[0]);
});

personnelRouter.post('/', async (req, res) => {
  const body = req.body || {};
  if (!body.nom || !body.username || !body.role) {
    return res.status(400).json({ error: 'nom, username et role sont requis.' });
  }
  const identifiant = body.identifiant || (await generateUniqueIdentifiant());
  try {
    const { rows } = await pool.query(
      `insert into personnel
        (identifiant, nom, username, email, supabase_user_id, role, actif, principal, zone_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       returning *`,
      [
        identifiant,
        body.nom,
        body.username.trim().toLowerCase(),
        body.email ?? null,
        body.supabase_user_id ?? req.user.id,
        body.role,
        body.actif ?? true,
        body.principal ?? false,
        body.zone_id ?? null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: "Ce nom d'utilisateur ou ce compte existe déjà." });
    }
    throw err;
  }
});

personnelRouter.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identifiant invalide.' });
  const body = req.body || {};
  const columns = ['nom', 'username', 'email', 'role', 'actif', 'principal', 'zone_id'];
  const provided = columns.filter((c) => body[c] !== undefined);
  if (provided.length === 0) {
    const { rows } = await pool.query('select * from personnel where id=$1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Introuvable.' });
    return res.json(rows[0]);
  }
  const setClause = provided.map((c, i) => `${c}=$${i + 1}`).join(',') + ', updated_at=now()';
  const { rows } = await pool.query(
    `update personnel set ${setClause} where id=$${provided.length + 1} returning *`,
    [...provided.map((c) => body[c]), id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Introuvable.' });
  res.json(rows[0]);
});

personnelRouter.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identifiant invalide.' });
  const { rowCount } = await pool.query('delete from personnel where id=$1', [id]);
  if (rowCount === 0) return res.status(404).json({ error: 'Introuvable.' });
  res.status(204).send();
});
