import { Router } from 'express';
import crypto from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { controlPlanePool } from '../controlPlaneDb.js';
import { getTenantPool } from '../tenantDb.js';
import { simpleRateLimit } from '../rateLimit.js';

// Espace propriétaire de la plateforme — vue d'ensemble de toutes les boutiques, réglages
// globaux (numéro WhatsApp, téléphone de contact) et diffusion de messages dans la cloche de
// notifications des admins. Complètement séparé de l'authentification Supabase (voir auth.js) :
// même si le compte d'un admin de boutique était compromis, il ne pourrait jamais atteindre ces
// routes — un seul mot de passe dédié (PLATFORM_OWNER_PASSWORD), jamais dans le code, connu du
// seul propriétaire.
export const plateformeRouter = Router();

const OWNER_PASSWORD = process.env.PLATFORM_OWNER_PASSWORD;
// Secret de signature des jetons de session propriétaire — distinct de tout secret Supabase.
// Si absent, un secret aléatoire est généré au démarrage : les sessions ne survivent pas à un
// redémarrage de l'API, mais l'app reste fonctionnelle plutôt que de planter au boot (mieux
// vaut se reconnecter après un déploiement qu'un crash-loop en production).
const SESSION_SECRET = new TextEncoder().encode(
  process.env.PLATFORM_OWNER_SECRET || crypto.randomBytes(32).toString('hex')
);
const SESSION_TTL = '12h';

// Volontairement strict — un mot de passe unique, statique, est une cible de choix pour du
// brute-force ; 5 essais/heure/IP le rend impraticable sans bloquer un vrai oubli de frappe.
const loginLimiter = simpleRateLimit({ windowMs: 60 * 60_000, max: 5 });

plateformeRouter.post('/login', loginLimiter, async (req, res) => {
  const password = (req.body && req.body.password) || '';
  if (!OWNER_PASSWORD) {
    return res.status(503).json({ error: "Espace propriétaire non configuré côté serveur." });
  }
  // Comparaison à temps constant — évite qu'une différence de timing ne renseigne un
  // attaquant sur combien de caractères du mot de passe il a déjà devinés.
  const a = Buffer.from(password);
  const b = Buffer.from(OWNER_PASSWORD);
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!valid) {
    return res.status(401).json({ error: 'Mot de passe incorrect.' });
  }
  const token = await new SignJWT({ role: 'platform_owner' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(SESSION_SECRET);
  res.json({ token });
});

// Middleware : exige un jeton de session propriétaire valide.
async function requireOwner(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentification requise.' });
  try {
    const { payload } = await jwtVerify(token, SESSION_SECRET);
    if (payload.role !== 'platform_owner') throw new Error('mauvais rôle');
    next();
  } catch {
    return res.status(401).json({ error: 'Session expirée ou invalide — reconnecte-toi.' });
  }
}

// Réglages publics — lus par TOUTES les boutiques (et l'écran de connexion, avant même qu'un
// tenant soit résolu) pour construire le lien WhatsApp de contact. Aucune authentification :
// c'est de l'information publique, affichée sur le site.
plateformeRouter.get('/config', async (_req, res) => {
  const { rows } = await controlPlanePool.query(
    `select whatsapp_number, contact_phone from platform_config where id='defaut'`
  );
  res.json(rows[0] || { whatsapp_number: null, contact_phone: null });
});

plateformeRouter.use(requireOwner);

plateformeRouter.put('/config', async (req, res) => {
  const body = req.body || {};
  const whatsappNumber = typeof body.whatsapp_number === 'string' ? body.whatsapp_number.trim() : null;
  const contactPhone = typeof body.contact_phone === 'string' ? body.contact_phone.trim() : null;
  const { rows } = await controlPlanePool.query(
    `update platform_config set whatsapp_number=$1, contact_phone=$2, updated_at=now()
     where id='defaut' returning whatsapp_number, contact_phone`,
    [whatsappNumber || null, contactPhone || null]
  );
  res.json(rows[0]);
});

// Vue d'ensemble de toutes les boutiques — pour surveiller l'activité de la plateforme.
// Enrichit chaque ligne avec deux informations qui vivent dans la base DE LA boutique
// (téléphone de contact, nombre de zones activées) — control_plane ne les connaît pas, il
// faut donc interroger le pool tenant de chacune. Volontairement tolérant : une boutique dont
// la base n'est pas (ou plus) accessible (encore 'provisioning', ou 'failed') ne doit pas faire
// échouer tout l'écran — elle apparaît juste avec ces deux champs à null/0.
plateformeRouter.get('/boutiques', async (_req, res) => {
  const { rows: boutiques } = await controlPlanePool.query(
    `select id, slug, nom, db_name, status, created_at, provisioned_at
     from boutiques order by created_at desc`
  );

  const enriched = await Promise.all(
    boutiques.map(async (b) => {
      const { db_name, ...rest } = b;
      try {
        const pool = getTenantPool(db_name);
        const [settingsResult, zonesResult, personnelResult, produitsResult, ventesResult, licenceResult] =
          await Promise.all([
            pool.query(`select telephone from settings where id='principale'`),
            pool.query(`select count(*)::int as n from zones where actif=true`),
            pool.query(`select count(*)::int as n from personnel`),
            pool.query(`select count(*)::int as n from produits`),
            // Le parseur numeric->float (voir db.js, OID 1700) s'applique à tous les pools —
            // pas de risque de "NaN" ici même si aucune vente n'existe encore (coalesce à 0).
            pool.query(`select coalesce(sum(total),0)::numeric as total from ventes`),
            pool.query(`select cle, activee_le, expire_le, duree_jours, trial_used from licence where id='principale'`),
          ]);
        return {
          ...rest,
          telephone: settingsResult.rows[0]?.telephone || null,
          zones_actives: zonesResult.rows[0]?.n ?? 0,
          personnel_count: personnelResult.rows[0]?.n ?? 0,
          produits_count: produitsResult.rows[0]?.n ?? 0,
          chiffre_affaires: ventesResult.rows[0]?.total ?? 0,
          licence: licenceResult.rows[0] || null,
        };
      } catch {
        return {
          ...rest,
          telephone: null,
          zones_actives: null,
          personnel_count: null,
          produits_count: null,
          chiffre_affaires: null,
          licence: null,
        };
      }
    })
  );

  res.json(enriched);
});

// Active ou suspend une boutique — une boutique 'suspended' est immédiatement bloquée pour
// TOUS ses utilisateurs (voir tenantResolver.js : resolveTenant/resolveTenantPublic renvoient
// déjà 409 dès que status !== 'active', aucun autre changement nécessaire pour que ça prenne
// effet). Volontairement limité aux boutiques déjà 'active' ou 'suspended' — une boutique
// encore 'provisioning' ou tombée en 'failed' n'a pas forcément de base exploitable, ce n'est
// pas à ce bouton de forcer un état incohérent.
plateformeRouter.put('/boutiques/:id/statut', async (req, res) => {
  const { id } = req.params;
  const status = req.body && req.body.status;
  if (status !== 'active' && status !== 'suspended') {
    return res.status(400).json({ error: "Statut invalide — 'active' ou 'suspended' uniquement." });
  }
  const { rows } = await controlPlanePool.query(
    `update boutiques set status=$1
     where id=$2 and status in ('active','suspended')
     returning id, slug, nom, status`,
    [status, id]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Boutique introuvable ou dans un état non modifiable.' });
  }
  res.json(rows[0]);
});

// Diffuse un message dans la cloche de notifications des admins d'une boutique (ou de toutes).
// target: 'all' ou l'id (uuid) d'une boutique précise dans control_plane.boutiques.
plateformeRouter.post('/annonce', async (req, res) => {
  const body = req.body || {};
  const message = (body.message || '').trim();
  const target = body.target || 'all';
  if (!message) return res.status(400).json({ error: 'Le message est requis.' });

  const { rows: boutiques } = await controlPlanePool.query(
    target === 'all'
      ? `select id, slug, db_name from boutiques where status='active'`
      : `select id, slug, db_name from boutiques where status='active' and id=$1`,
    target === 'all' ? [] : [target]
  );
  if (boutiques.length === 0) {
    return res.status(404).json({ error: 'Aucune boutique active correspondante.' });
  }

  const results = await Promise.allSettled(
    boutiques.map((b) =>
      getTenantPool(b.db_name).query(
        `insert into notifications (type, message, target_role) values ('plateforme', $1, 'admin')`,
        [message]
      )
    )
  );
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) {
    console.error(`Annonce plateforme : échec sur ${failed}/${boutiques.length} boutique(s).`);
  }
  const sent = boutiques.length - failed;

  const targetLabel = target === 'all' ? 'Toutes les boutiques actives' : boutiques[0]?.nom || target;
  await controlPlanePool.query(
    `insert into annonces (message, target, target_label, sent_count, failed_count)
     values ($1, $2, $3, $4, $5)`,
    [message, target, targetLabel, sent, failed]
  );

  res.json({ sent, failed });
});

// Journal des annonces déjà envoyées — simple historique, le plus récent d'abord.
plateformeRouter.get('/annonces', async (_req, res) => {
  const { rows } = await controlPlanePool.query(
    `select id, message, target_label, sent_count, failed_count, created_at
     from annonces order by created_at desc limit 100`
  );
  res.json(rows);
});
