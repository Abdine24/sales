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
//
// Chaque clé ne s'active qu'UNE fois, sur une seule boutique (registre licences_utilisees dans
// la base de contrôle) : renouveler exige une nouvelle clé. Ressaisir la clé en cours ne change
// rien (réponse idempotente, dates intactes) — utile si l'activation d'une boutique neuve doit
// être relancée après un échec à l'étape suivante (création de l'admin, voir localAuth.ts).
licenceStatusRouter.post('/activer', async (req, res) => {
  const rawKey = req.body?.cle;
  const validation = validateLicenseKey(rawKey);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.reason || 'Clé de licence invalide.' });
  }

  const cleanKey = rawKey.trim().toUpperCase();

  const { rows: catalogue } = await controlPlanePool.query(
    'select status from licences_catalogue where cle=$1',
    [cleanKey]
  );
  if (catalogue[0]?.status === 'revoked') {
    return res.status(409).json({ error: 'Cette clé de licence a été révoquée.' });
  }

  const { rows: current } = await req.tenantPool.query("select * from licence where id='principale'");
  if (current[0]?.cle?.trim().toUpperCase() === cleanKey) {
    // Clé déjà en cours dans cette boutique : on s'assure seulement qu'elle est bien inscrite au
    // registre (boutiques activées avant son introduction), sans toucher aux dates.
    await controlPlanePool.query(
      'insert into licences_utilisees (cle, boutique_id) values ($1,$2) on conflict (cle) do nothing',
      [cleanKey, req.boutique.id]
    );
    return res.json(current[0]);
  }

  // Une clé de 7 jours ne peut venir que du preset d'essai gratuit (voir DURATION_PRESET_DAYS
  // côté client — aucun abonnement payant ne dure 7 jours) : une seule utilisation par
  // boutique, vérifiée ici même si /licences/essai a déjà refusé d'en signer une seconde —
  // c'est la vraie porte, la génération n'est qu'un confort côté client.
  const isTrial = validation.days === 7;
  if (isTrial && current[0]?.trial_used) {
    return res.status(409).json({ error: "L'essai gratuit de 7 jours a déjà été utilisé pour cette boutique — choisis un abonnement payant pour continuer." });
  }

  // Réserve la clé AVANT d'écrire la licence : deux activations simultanées de la même clé ne
  // peuvent pas réussir toutes les deux (clé primaire du registre).
  const { rows: claimed } = await controlPlanePool.query(
    'insert into licences_utilisees (cle, boutique_id) values ($1,$2) on conflict (cle) do nothing returning cle',
    [cleanKey, req.boutique.id]
  );
  if (claimed.length === 0) {
    const { rows: owner } = await controlPlanePool.query('select boutique_id from licences_utilisees where cle=$1', [cleanKey]);
    const sameBoutique = owner[0]?.boutique_id === req.boutique.id;
    return res.status(409).json({
      error: sameBoutique
        ? 'Cette clé a déjà été utilisée par ta boutique — il faut une nouvelle clé pour renouveler.'
        : 'Cette clé de licence est déjà utilisée par une autre boutique.',
    });
  }

  const activeeLe = new Date().toISOString();
  const expireLe = computeExpiry(activeeLe, validation.days);
  let rows;
  try {
    ({ rows } = await req.tenantPool.query(
      `insert into licence (id, cle, activee_le, duree_jours, expire_le, trial_used)
       values ('principale', $1, $2, $3, $4, $5)
       on conflict (id) do update set cle=excluded.cle, activee_le=excluded.activee_le,
         duree_jours=excluded.duree_jours, expire_le=excluded.expire_le,
         trial_used=licence.trial_used or excluded.trial_used
       returning *`,
      [cleanKey, activeeLe, validation.days, expireLe, isTrial]
    ));
  } catch (err) {
    // La licence n'a pas été écrite : la clé n'est pas consommée, on libère sa réservation.
    await controlPlanePool.query('delete from licences_utilisees where cle=$1', [cleanKey]).catch(() => {});
    throw err;
  }

  // Mettre à jour la clé dans le catalogue du panneau propriétaire si elle y a été générée, avec
  // la boutique qui l'a utilisée (req.boutique, posé par tenantResolver.js — l'ancien code lisait
  // req.tenant, qui n'existe pas : la boutique restait toujours vide).
  try {
    await controlPlanePool.query(
      `update licences_catalogue
       set status = 'active', boutique_id = $1, boutique_nom = $2, boutique_slug = $3, activated_at = $4
       where cle = $5`,
      [req.boutique.id, req.boutique.nom, req.boutique.slug, activeeLe, cleanKey]
    );
  } catch (err) {
    console.error('Échec mise à jour catalogue licence :', err);
  }

  res.json(rows[0]);

});

