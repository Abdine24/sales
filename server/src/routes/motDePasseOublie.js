import { Router } from 'express';
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

  const { rows } = await req.tenantPool.query('select id, nom, role, actif from personnel where email=$1', [email]);
  const person = rows[0];

  // Email inconnu de notre base : on n'envoie rien du tout, jamais (pas d'appel à Supabase).
  if (!person) {
    return res.json({ isAdmin: false, sendEmail: false });
  }

  // Compte admin connu : seul cas où le flux Supabase classique (email de réinitialisation)
  // est déclenché.
  if (person.role === 'admin') {
    return res.json({ isAdmin: true, sendEmail: true });
  }

  // Membre de l'équipe connu : on prévient l'admin, pas d'email envoyé à personne.
  if (person.actif) {
    await req.tenantPool.query(
      `insert into notifications (type, message, target_role, related_personnel_id)
       values ('password_reset_request', $1, 'admin', $2)`,
      [`${person.nom} demande une réinitialisation de son mot de passe.`, person.id]
    );
  }

  res.json({ isAdmin: false, sendEmail: false });
});
