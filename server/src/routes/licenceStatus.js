import { Router } from 'express';
import { validateLicenseKey } from '../licence.js';
import { controlPlanePool } from '../controlPlaneDb.js';

export const licenceStatusRouter = Router();

const computeExpiry = (activeeLe, days) => {
  if (!days) return null;
  const cappedDays = Math.min(365, Math.max(1, days));
  return new Date(new Date(activeeLe).getTime() + cappedDays * 24 * 60 * 60 * 1000).toISOString();
};

licenceStatusRouter.get('/', async (req, res) => {
  const { rows } = await req.tenantPool.query("select * from licence where id='principale'");
  res.json(rows[0] || null);
});

// Active (première fois) ou renouvelle (les fois suivantes) la licence de la boutique. La
// période repart toujours de la date d'activation — pas de cumul avec le temps restant de
// l'ancienne clé, comme le faisait déjà l'app côté client.
licenceStatusRouter.post('/activer', async (req, res) => {
  const rawKey = req.body?.cle;
  const validation = validateLicenseKey(rawKey);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.reason || 'Clé de licence invalide.' });
  }

  const cleanKey = rawKey.trim().toUpperCase();

  // Une clé de 7 jours ne peut venir que du preset d'essai gratuit (voir DURATION_PRESET_DAYS
  // côté client — aucun abonnement payant ne dure 7 jours) : une seule utilisation par
  // boutique, vérifiée ici même si /licences/essai a déjà refusé d'en signer une seconde —
  // c'est la vraie porte, la génération n'est qu'un confort côté client.
  const isTrial = validation.days === 7;
  if (isTrial) {
    const { rows: existing } = await req.tenantPool.query("select trial_used from licence where id='principale'");
    if (existing[0]?.trial_used) {
      return res.status(409).json({ error: "L'essai gratuit de 7 jours a déjà été utilisé pour cette boutique — choisis un abonnement payant pour continuer." });
    }
  }

  const activeeLe = new Date().toISOString();
  const expireLe = computeExpiry(activeeLe, validation.days);
  const { rows } = await req.tenantPool.query(
    `insert into licence (id, cle, activee_le, duree_jours, expire_le, trial_used)
     values ('principale', $1, $2, $3, $4, $5)
     on conflict (id) do update set cle=excluded.cle, activee_le=excluded.activee_le,
       duree_jours=excluded.duree_jours, expire_le=excluded.expire_le,
       trial_used=licence.trial_used or excluded.trial_used
     returning *`,
    [cleanKey, activeeLe, validation.days, expireLe, isTrial]
  );

  // Mettre à jour la clé dans le catalogue du panneau propriétaire si elle y a été générée
  try {
    const boutiqueId = req.tenant?.id || null;
    const boutiqueNom = req.tenant?.nom || null;
    await controlPlanePool.query(
      `update licences_catalogue
       set status = 'active', boutique_id = $1, boutique_nom = $2, activated_at = $3
       where cle = $4`,
      [boutiqueId, boutiqueNom, activeeLe, cleanKey]
    );
  } catch (err) {
    console.error('Échec mise à jour catalogue licence :', err);
  }

  res.json(rows[0]);
});

