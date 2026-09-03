import { Router } from 'express';
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

// Seul preset accessible publiquement : l'essai gratuit (7 jours). Les durées payantes ne
// sont générées que via le script CLI (server/../scripts/generate-license.mjs), exécuté
// uniquement par l'administrateur de la boutique — jamais exposées en HTTP.
licencesRouter.post('/essai', trialLimiter, (_req, res) => {
  const cle = generateLicenseKey(7);
  res.json({ cle, days: 7 });
});
