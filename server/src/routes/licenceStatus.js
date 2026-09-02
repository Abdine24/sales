import { Router } from 'express';
import { pool } from '../db.js';
import { validateLicenseKey } from '../licence.js';

export const licenceStatusRouter = Router();

const computeExpiry = (activeeLe, days) => {
  if (!days) return null;
  const cappedDays = Math.min(365, Math.max(1, days));
  return new Date(new Date(activeeLe).getTime() + cappedDays * 24 * 60 * 60 * 1000).toISOString();
};

licenceStatusRouter.get('/', async (_req, res) => {
  const { rows } = await pool.query("select * from licence where id='principale'");
  res.json(rows[0] || null);
});

// Active (première fois) ou renouvelle (les fois suivantes) la licence de la boutique. La
// période repart toujours de la date d'activation — pas de cumul avec le temps restant de
// l'ancienne clé, comme le faisait déjà l'app côté client.
licenceStatusRouter.post('/activer', async (req, res) => {
  const validation = validateLicenseKey(req.body?.cle);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.reason || 'Clé de licence invalide.' });
  }
  const activeeLe = new Date().toISOString();
  const expireLe = computeExpiry(activeeLe, validation.days);
  const { rows } = await pool.query(
    `insert into licence (id, cle, activee_le, duree_jours, expire_le)
     values ('principale', $1, $2, $3, $4)
     on conflict (id) do update set cle=excluded.cle, activee_le=excluded.activee_le,
       duree_jours=excluded.duree_jours, expire_le=excluded.expire_le
     returning *`,
    [req.body.cle.trim().toUpperCase(), activeeLe, validation.days, expireLe]
  );
  res.json(rows[0]);
});
