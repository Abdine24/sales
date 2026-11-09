// Doit rester le tout premier import : rattrape les erreurs des routes async (voir le fichier).
import { errorHandler } from './asyncErrors.js';
import express from 'express';
import cors from 'cors';
import { maintenancePool } from './db.js';
import { controlPlanePool, applyControlPlaneSchema } from './controlPlaneDb.js';
import { requireAuth } from './auth.js';
import { access, boutiqueHasPrincipal, ALL, STAFF, ADMIN } from './access.js';
import { resolveTenant, resolveTenantPublic } from './tenantResolver.js';
import { boutiquesRouter } from './routes/boutiques.js';
import { produitsRouter } from './routes/produits.js';
import { licencesRouter } from './routes/licences.js';
import { categoriesRouter } from './routes/categories.js';
import { zonesRouter } from './routes/zones.js';
import { fournisseursRouter } from './routes/fournisseurs.js';
import { clientsRouter } from './routes/clients.js';
import { paniersRouter } from './routes/paniers.js';
import { personnelRouter, personnelMeHandler } from './routes/personnel.js';
import { settingsRouter } from './routes/settings.js';
import { licenceStatusRouter } from './routes/licenceStatus.js';
import { ventesRouter } from './routes/ventes.js';
import { achatsStockRouter } from './routes/achatsStock.js';
import { ajustementsStockRouter } from './routes/ajustementsStock.js';
import { retoursRouter } from './routes/retours.js';
import { reglementsRouter } from './routes/reglements.js';
import { notificationsRouter } from './routes/notifications.js';
import { motDePasseOublieRouter } from './routes/motDePasseOublie.js';
import { plateformeRouter } from './routes/plateforme.js';
import { facturesRouter } from './routes/factures.js';
import { logoRouter } from './routes/logo.js';
import { applySchemaToTenant } from './schemaApply.js';
import { getTenantPool } from './tenantDb.js';

const app = express();
// Nécessaire derrière un reverse proxy (Nginx) pour que req.ip reflète le vrai visiteur
// (sinon le rate-limiting des routes /licences et /boutiques verrait toujours l'IP du proxy).
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Endpoint public — vérifie juste que l'API et la base de contrôle répondent, pas d'auth
// requise (utilisé pour le monitoring et par Nginx).
app.get('/health', async (_req, res) => {
  try {
    await controlPlanePool.query('select 1');
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'db_unreachable' });
  }
});

// Provisionnement en libre-service d'une nouvelle boutique — aucun tenant résolu, puisque
// c'est justement la route qui en crée un. Voir routes/boutiques.js.
app.use('/boutiques', boutiquesRouter);

// Espace propriétaire de la plateforme — sa propre authentification par mot de passe dédié,
// distincte de Supabase (voir routes/plateforme.js). /config est public (lu par toutes les
// boutiques), le reste exige une session propriétaire valide.
app.use('/plateforme', plateformeRouter);

// Logo de chaque boutique, public (lu par des balises <img>) — voir routes/logo.js.
app.use('/logo', logoRouter);

// Publiques (pas de JWT), mais un tenant DOIT être résolu (essai gratuit et
// mot-de-passe-oublié sont tous deux propres à une boutique — voir tenantResolver.js).
app.use('/licences', resolveTenantPublic, licencesRouter);
app.use('/mot-de-passe-oublie', resolveTenantPublic, motDePasseOublieRouter);

// Toutes les autres routes métier exigent, dans cet ordre : un utilisateur Supabase authentifié
// (requireAuth), un tenant résolu dont il n'est pas membre d'une AUTRE boutique (resolveTenant),
// puis une fiche personnel ACTIVE dans cette boutique avec le bon rôle — et, pour les écritures
// métier, une licence non expirée (access, voir access.js). Les rôles reprennent les pages
// autorisées côté client (src/services/localAuth.ts, canAccess) :
//   caissier : caisse, ventes, clients — gérant : + tableau de bord et stock — admin : tout.
const auth = [requireAuth, resolveTenant];

// Rattachement du compte connecté à sa fiche personnel : appelé juste après la connexion, avant
// que la fiche soit forcément liée (voir routes/personnel.js) — ne renvoie que la fiche de
// l'appelant, donc pas de contrôle de rôle ici.
app.get('/personnel/me', ...auth, personnelMeHandler);

// Activation d'une boutique neuve : son créateur n'a pas encore de fiche personnel quand il
// active la licence puis crée l'administrateur principal (src/services/localAuth.ts). Ces deux
// seules requêtes restent permises sans fiche, et uniquement tant qu'aucun principal n'existe.
const activationLicence = async (req) =>
  req.method === 'POST' && req.path === '/activer' && !(await boutiqueHasPrincipal(req));
const creationPrincipal = async (req) =>
  req.method === 'POST' && req.path === '/' && req.body?.principal === true && !(await boutiqueHasPrincipal(req));

app.use('/produits', ...auth, access({ read: ALL, write: STAFF, licence: true }), produitsRouter);
app.use('/categories', ...auth, access({ read: ALL, write: ADMIN, licence: true }), categoriesRouter);
app.use('/zones', ...auth, access({ read: ALL, write: ADMIN, licence: true }), zonesRouter);
app.use('/fournisseurs', ...auth, access({ read: ALL, write: ADMIN, licence: true }), fournisseursRouter);
app.use('/clients', ...auth, access({ read: ALL, write: ALL, licence: true }), clientsRouter);
app.use('/paniers-en-attente', ...auth, access({ read: ALL, write: ALL, licence: true }), paniersRouter);
app.use('/personnel', ...auth, access({ read: ADMIN, write: ADMIN, allowWithoutProfile: creationPrincipal }), personnelRouter);
app.use('/settings', ...auth, access({ read: ALL, write: ADMIN }), settingsRouter);
app.use('/licence', ...auth, access({ read: ALL, write: ADMIN, allowWithoutProfile: activationLicence }), licenceStatusRouter);
app.use('/ventes', ...auth, access({ read: ALL, write: ALL, licence: true }), ventesRouter);
app.use('/achats-stock', ...auth, access({ read: STAFF, write: STAFF, licence: true }), achatsStockRouter);
app.use('/ajustements-stock', ...auth, access({ read: STAFF, write: STAFF, licence: true }), ajustementsStockRouter);
app.use('/retours', ...auth, access({ read: ALL, write: ALL, licence: true }), retoursRouter);
app.use('/reglements', ...auth, access({ read: ALL, write: ALL, licence: true }), reglementsRouter);
app.use('/notifications', ...auth, access({ read: ALL, write: ALL }), notificationsRouter);
app.use('/factures', ...auth, access({ read: ALL, write: ALL }), facturesRouter);

// Toujours en dernier : transforme toute erreur (y compris celles des routes async) en réponse
// JSON propre au lieu d'arrêter le process (voir asyncErrors.js).
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

// Rejoue schema.sql (idempotent — CREATE TABLE IF NOT EXISTS / ALTER TABLE ... ADD COLUMN IF
// NOT EXISTS partout) contre CHAQUE boutique active à chaque démarrage de l'API, pas seulement
// au provisioning d'une nouvelle. Sans ça, une évolution du schéma (nouvelle table/colonne,
// comme `factures`/`facture_sequences` ou `settings.receipt_template_id`) n'existerait que pour
// les boutiques créées APRÈS le déploiement du changement — toutes les boutiques déjà en place
// resteraient bloquées sur l'ancien schéma indéfiniment. Une boutique isolée en échec (base
// injoignable, etc.) ne doit jamais empêcher le démarrage de l'API pour toutes les autres.
async function migrateExistingTenants() {
  const { rows: boutiques } = await controlPlanePool.query(`select slug, db_name from boutiques where status='active'`);
  for (const b of boutiques) {
    try {
      await applySchemaToTenant(getTenantPool(b.db_name));
    } catch (err) {
      console.error(`Échec de la migration du schéma pour la boutique "${b.slug}" :`, err);
    }
  }
  console.log(`Schéma vérifié/mis à jour pour ${boutiques.length} boutique(s) active(s).`);
}

// Rattrapage : les clés du catalogue activées avant la correction de licenceStatus.js n'ont
// pas de boutique associée. La clé en cours de chaque boutique est dans sa propre base
// (table licence) — on la relie au catalogue. Idempotent : ne touche que les clés sans boutique.
async function backfillLicenceBoutiques() {
  const { rows: boutiques } = await controlPlanePool.query(
    "select id, slug, nom, db_name from boutiques where status in ('active', 'suspended')"
  );
  let linked = 0;
  for (const b of boutiques) {
    try {
      const { rows } = await getTenantPool(b.db_name).query(
        "select cle, activee_le from licence where id='principale'"
      );
      if (!rows[0]?.cle) continue;
      // La clé en cours est consommée : elle ne doit plus pouvoir servir à une autre boutique
      // (registre des clés à usage unique, voir routes/licenceStatus.js).
      await controlPlanePool.query(
        'insert into licences_utilisees (cle, boutique_id, utilisee_le) values ($1,$2,$3) on conflict (cle) do nothing',
        [rows[0].cle.trim().toUpperCase(), b.id, rows[0].activee_le]
      );
      const result = await controlPlanePool.query(
        `update licences_catalogue
         set status = case when status = 'unused' then 'active' else status end,
             boutique_id = $1, boutique_nom = $2, boutique_slug = $3,
             activated_at = coalesce(activated_at, $4)
         where cle = $5 and boutique_id is null`,
        [b.id, b.nom, b.slug, rows[0].activee_le, rows[0].cle.trim().toUpperCase()]
      );
      linked += result.rowCount;
    } catch (err) {
      console.error(`Rattrapage des licences impossible pour "${b.slug}" :`, err.message);
    }
  }
  if (linked > 0) console.log(`${linked} clé(s) du catalogue reliée(s) à leur boutique.`);
}

async function startWithRetry(retries = 10, delayMs = 2000) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      // Seule la base de contrôle a SON schéma appliqué directement ici — celui de chaque boutique
      // est rejoué séparément par migrateExistingTenants() (nouvelles boutiques ET existantes).
      await applyControlPlaneSchema();
      // Vérifie que la connexion de maintenance (utilisée pour CREATE DATABASE) fonctionne dès
      // le démarrage plutôt que d'échouer silencieusement à la première création de boutique.
      await maintenancePool.query('select 1');
      await migrateExistingTenants();
      await backfillLicenceBoutiques().catch((err) => console.error('Rattrapage des licences :', err.message));
      app.listen(PORT, () => {
        console.log(`API iVente démarrée sur le port ${PORT}`);
      });
      return;
    } catch (err) {
      console.error(`Tentative de démarrage ${attempt}/${retries} échouée (${err.message}) — nouvel essai dans ${delayMs / 1000}s...`);
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

startWithRetry().catch((err) => {
  console.error("Échec du démarrage de l'API :", err);
  process.exit(1);
});
