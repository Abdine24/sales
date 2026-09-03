import { Router } from 'express';
import { poolFor, closePool, maintenancePool } from '../db.js';
import { controlPlanePool } from '../controlPlaneDb.js';
import { applySchemaToTenant } from '../schemaApply.js';
import { simpleRateLimit } from '../rateLimit.js';
import { SLUG_RE, RESERVED_SLUGS } from '../tenantResolver.js';

export const boutiquesRouter = Router();

// Rare et volontairement strict — créer une boutique déclenche un vrai CREATE DATABASE, pas
// une simple écriture. 10/heure/IP laisse largement de la place à un vrai essai/erreur de
// slug (nom déjà pris) sans permettre un bombardement de bases vides.
const limiter = simpleRateLimit({ windowMs: 60 * 60_000, max: 10 });

// Crée une nouvelle boutique en libre-service : réserve son slug (sous-domaine), provisionne
// une base Postgres dédiée avec le schéma métier complet. Ne nécessite aucun tenant résolu —
// c'est la seule route de toute l'API dans ce cas, puisqu'aucune boutique n'existe encore à
// ce stade (voir tenantResolver.js, qui ne s'applique jamais à cette route).
boutiquesRouter.post('/', limiter, async (req, res) => {
  const body = req.body || {};
  const nom = (body.nom || '').trim();
  const slug = (body.slug || '').trim().toLowerCase();

  if (!nom) {
    return res.status(400).json({ error: 'Le nom de la boutique est requis.' });
  }
  if (!SLUG_RE.test(slug) || RESERVED_SLUGS.has(slug)) {
    return res.status(400).json({
      error:
        "Adresse de boutique invalide — lettres minuscules, chiffres et tirets uniquement, doit commencer par une lettre (3 à 31 caractères).",
    });
  }

  const dbName = `tenant_${slug}`;

  const { rows } = await controlPlanePool.query(
    `insert into boutiques (slug, nom, db_name, status)
     values ($1,$2,$3,'provisioning')
     on conflict (slug) do nothing
     returning *`,
    [slug, nom, dbName]
  );
  if (rows.length === 0) {
    return res.status(409).json({ error: 'Cette adresse de boutique est déjà prise.' });
  }
  const boutique = rows[0];

  try {
    // CREATE DATABASE ne peut jamais s'exécuter dans une transaction, ni depuis une connexion
    // à la base qu'on est en train de créer — d'où la connexion de maintenance dédiée. `slug`
    // est déjà validé par SLUG_RE (lettres/chiffres/tirets uniquement) : pas d'injection SQL
    // possible via l'interpolation du nom de base, seulement des guillemets nécessaires pour
    // le tiret.
    await maintenancePool.query(`create database "${dbName}"`);

    const tenantPool = poolFor(dbName);
    await applySchemaToTenant(tenantPool);

    await controlPlanePool.query(
      `update boutiques set status='active', provisioned_at=now() where id=$1`,
      [boutique.id]
    );
  } catch (err) {
    await controlPlanePool.query(`update boutiques set status='failed' where id=$1`, [boutique.id]);
    await closePool(dbName).catch(() => {});
    console.error(`Échec du provisioning de la boutique "${slug}" :`, err);
    return res.status(500).json({ error: 'Échec de la création de la boutique — réessaie dans quelques instants.' });
  }

  res.status(201).json({ slug: boutique.slug, nom: boutique.nom });
});
