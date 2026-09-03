import { controlPlanePool } from './controlPlaneDb.js';
import { getTenantPool, withTenantTransaction } from './tenantDb.js';

// Étiquettes de sous-domaine jamais attribuables à une boutique (déjà utilisées par la
// plateforme elle-même, ou réservées pour éviter toute confusion).
const RESERVED_SLUGS = new Set([
  'api', 'app', 'www', 'admin', 'mail', 'ftp', 'static', 'assets', 'support', 'help',
  'test', 'staging', 'ns1', 'ns2',
]);

export const SLUG_RE = /^[a-z][a-z0-9-]{2,30}$/;

// Extrait l'étiquette de boutique d'un nom d'hôte du type "<slug>.azanga.tech". Exige au
// moins 3 segments (slug + domaine + tld) pour ne jamais confondre "azanga.tech" lui-même
// (ou "app.azanga.tech") avec une boutique.
function extractSlug(hostname) {
  if (!hostname) return null;
  const host = String(hostname).split(':')[0].trim().toLowerCase();
  const parts = host.split('.');
  if (parts.length < 3) return null;
  const slug = parts[0];
  if (RESERVED_SLUGS.has(slug) || !SLUG_RE.test(slug)) return null;
  return slug;
}

async function lookupBoutique(hostname) {
  const slug = extractSlug(hostname);
  if (slug) {
    const { rows } = await controlPlanePool.query('select * from boutiques where slug=$1', [slug]);
    if (rows.length > 0) return rows[0];
  }
  // Domaine personnalisé — scaffoldé (table domaines_personnalises), pas encore branché
  // (voir plan multi-tenant §4). Ajouter ici un lookup domaines_personnalises quand cette
  // fonctionnalité sera construite ; aucun changement frontend ne sera nécessaire, le
  // frontend envoie déjà le nom d'hôte complet plutôt qu'un slug pré-découpé.
  return null;
}

// Attache la boutique résolue + son pool à la requête, pour que le handler de route (et tout
// middleware suivant) n'ait plus à savoir comment le tenant a été déterminé.
function attachTenant(req, boutique) {
  req.boutique = boutique;
  req.tenantPool = getTenantPool(boutique.db_name);
  req.withTenantTransaction = (fn) => withTenantTransaction(req.tenantPool, fn);
}

// Pour les routes publiques (pré-authentification) : /licences, /mot-de-passe-oublie.
// Résout uniquement depuis l'en-tête X-Tenant-Host envoyé par le frontend.
export async function resolveTenantPublic(req, res, next) {
  try {
    const boutique = await lookupBoutique(req.headers['x-tenant-host']);
    if (!boutique) return res.status(404).json({ error: 'Boutique introuvable.' });
    if (boutique.status !== 'active') {
      return res.status(409).json({ error: "Cette boutique n'est pas (ou plus) disponible." });
    }
    attachTenant(req, boutique);
    next();
  } catch (err) {
    next(err);
  }
}

// Pour les routes métier authentifiées — monté après requireAuth, donc req.user existe déjà
// (jeton Supabase vérifié). Résout le tenant ET vérifie que cet utilisateur appartient bien
// à CETTE boutique : empêche qu'un en-tête falsifié fasse pointer un jeton valide vers les
// données d'une autre boutique.
export async function resolveTenant(req, res, next) {
  try {
    const hostname = req.headers['x-tenant-host'];
    let boutique = await lookupBoutique(hostname);

    // Fenêtre transitoire de bascule (voir plan multi-tenant §5, étape 3) : tant que le
    // frontend n'envoie pas encore systématiquement l'en-tête (déploiement front/API jamais
    // atomique), une requête sans en-tête est traitée comme visant la boutique historique
    // "principale" plutôt que rejetée — évite une coupure des utilisateurs existants pendant
    // la bascule progressive. À retirer une fois la bascule confirmée partout (voir plan §7).
    if (!boutique && !hostname) {
      const { rows } = await controlPlanePool.query("select * from boutiques where slug='principale'");
      boutique = rows[0] || null;
    }

    if (!boutique) return res.status(404).json({ error: 'Boutique introuvable.' });
    if (boutique.status !== 'active') {
      return res.status(409).json({ error: "Cette boutique n'est pas (ou plus) disponible." });
    }

    const { rows: mapping } = await controlPlanePool.query(
      'select boutique_id from utilisateurs_boutiques where supabase_user_id=$1',
      [req.user.id]
    );
    // mapping.length === 0 est autorisé (pas une erreur) : c'est le cas normal lors du tout
    // premier bootstrap d'une boutique, avant que POST /personnel n'écrive la correspondance
    // (voir routes/personnel.js). Seule une correspondance EXISTANTE mais différente est
    // rejetée.
    if (mapping.length > 0 && mapping[0].boutique_id !== boutique.id) {
      return res.status(403).json({ error: 'Accès refusé pour cette boutique.' });
    }

    attachTenant(req, boutique);
    next();
  } catch (err) {
    next(err);
  }
}
