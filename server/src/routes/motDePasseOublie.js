import { Router } from 'express';
import { pool } from '../db.js';
import { simpleRateLimit } from '../rateLimit.js';

export const motDePasseOublieRouter = Router();

const limiter = simpleRateLimit({ windowMs: 60_000, max: 10 }); // 10/min/IP

// Route publique appelée par l'écran "Mot de passe oublié" AVANT toute authentification, pour
// savoir quoi faire : l'admin reste en libre-service (email Supabase classique), un membre de
// l'équipe déclenche à la place une notification pour l'admin — c'est lui qui gère les mots de
// passe de son équipe (voir server/src/routes/personnel.js).
motDePasseOublieRouter.post('/', limiter, async (req, res) => {
  const email = (req.body?.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'email requis.' });

  const { rows } = await pool.query('select id, nom, role, actif from personnel where email=$1', [email]);
  const person = rows[0];

  // Email inconnu ou compte admin : on laisse le flux Supabase habituel s'en charger (il ne
  // révèle pas non plus si le compte existe, donc pas de fuite d'information ici).
  if (!person || person.role === 'admin') {
    return res.json({ isAdmin: true });
  }

  if (person.actif) {
    await pool.query(
      `insert into notifications (type, message, target_role, related_personnel_id)
       values ('password_reset_request', $1, 'admin', $2)`,
      [`${person.nom} demande une réinitialisation de son mot de passe.`, person.id]
    );
  }

  res.json({ isAdmin: false });
});
