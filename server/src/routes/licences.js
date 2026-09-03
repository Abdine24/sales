import { Router } from 'express';
import { pool } from '../db.js';
import { generateLicenseKey, validateLicenseKey } from '../licence.js';
import { simpleRateLimit } from '../rateLimit.js';

export const licencesRouter = Router();

// Public (appelé avant toute authentification, pendant l'activation d'une boutique) mais
// limité en débit pour rendre le brute-force de clés impraticable.
const validateLimiter = simpleRateLimit({ windowMs: 60_000, max: 20 }); // 20/min/IP
// Plus strict : évite qu'un visiteur ne génère un nombre illimité d'essais gratuits — mais
// pas trop serré non plus, pour ne pas gêner un admin qui teste plusieurs fois de suite
// pendant la mise en place initiale de sa boutique.
const trialLimiter = simpleRateLimit({ windowMs: 60 * 60_000, max: 20 }); // 20/heure/IP

licencesRouter.post('/valider', validateLimiter, (req, res) => {
  const result = validateLicenseKey(req.body?.cle);
  res.json(result);
});

// Seul preset accessible publiquement : l'essai gratuit (7 jours), une seule fois par
// boutique. Les durées payantes ne sont générées que via le script CLI
// (server/../scripts/generate-license.mjs), exécuté uniquement par l'administrateur de la
// boutique — jamais exposées en HTTP.
licencesRouter.post('/essai', trialLimiter, async (_req, res) => {
  // Vérifié ici (avant même de signer une clé) ET re-vérifié à l'activation (voir
  // licenceStatus.js) : sans ce deuxième contrôle, une clé d'essai obtenue une première fois
  // légitimement resterait valide indéfiniment en la re-soumettant.
  const { rows } = await pool.query("select trial_used from licence where id='principale'");
  if (rows[0]?.trial_used) {
    return res.status(409).json({ error: "L'essai gratuit de 7 jours a déjà été utilisé pour cette boutique." });
  }
  const cle = generateLicenseKey(7);
  res.json({ cle, days: 7 });
});
