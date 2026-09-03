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
plateformeRouter.get('/boutiques', async (_req, res) => {
  const { rows } = await controlPlanePool.query(
    `select id, slug, nom, status, created_at, provisioned_at
     from boutiques order by created_at desc`
  );
  res.json(rows);
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
  res.json({ sent: boutiques.length - failed, failed });
});
