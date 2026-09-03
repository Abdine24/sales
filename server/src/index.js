import express from 'express';
import cors from 'cors';
import { maintenancePool } from './db.js';
import { controlPlanePool, applyControlPlaneSchema } from './controlPlaneDb.js';
import { requireAuth } from './auth.js';
import { resolveTenant, resolveTenantPublic } from './tenantResolver.js';
import { boutiquesRouter } from './routes/boutiques.js';
import { produitsRouter } from './routes/produits.js';
import { licencesRouter } from './routes/licences.js';
import { categoriesRouter } from './routes/categories.js';
import { zonesRouter } from './routes/zones.js';
import { fournisseursRouter } from './routes/fournisseurs.js';
import { clientsRouter } from './routes/clients.js';
import { paniersRouter } from './routes/paniers.js';
import { personnelRouter } from './routes/personnel.js';
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

// Publiques (pas de JWT), mais un tenant DOIT être résolu (essai gratuit et
// mot-de-passe-oublié sont tous deux propres à une boutique — voir tenantResolver.js).
app.use('/licences', resolveTenantPublic, licencesRouter);
app.use('/mot-de-passe-oublie', resolveTenantPublic, motDePasseOublieRouter);

// Toutes les autres routes métier exigent un utilisateur Supabase authentifié ET un tenant
// résolu (dans cet ordre : resolveTenant vérifie que le compte appartient bien à cette
// boutique, donc a besoin de req.user déjà posé par requireAuth).
app.use('/produits', requireAuth, resolveTenant, produitsRouter);
app.use('/categories', requireAuth, resolveTenant, categoriesRouter);
app.use('/zones', requireAuth, resolveTenant, zonesRouter);
app.use('/fournisseurs', requireAuth, resolveTenant, fournisseursRouter);
app.use('/clients', requireAuth, resolveTenant, clientsRouter);
app.use('/paniers-en-attente', requireAuth, resolveTenant, paniersRouter);
app.use('/personnel', requireAuth, resolveTenant, personnelRouter);
app.use('/settings', requireAuth, resolveTenant, settingsRouter);
app.use('/licence', requireAuth, resolveTenant, licenceStatusRouter);
app.use('/ventes', requireAuth, resolveTenant, ventesRouter);
app.use('/achats-stock', requireAuth, resolveTenant, achatsStockRouter);
app.use('/ajustements-stock', requireAuth, resolveTenant, ajustementsStockRouter);
app.use('/retours', requireAuth, resolveTenant, retoursRouter);
app.use('/reglements', requireAuth, resolveTenant, reglementsRouter);
app.use('/notifications', requireAuth, resolveTenant, notificationsRouter);
app.use('/factures', requireAuth, resolveTenant, facturesRouter);

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

async function start() {
  // Seule la base de contrôle a SON schéma appliqué directement ici — celui de chaque boutique
  // est rejoué séparément par migrateExistingTenants() (nouvelles boutiques ET existantes).
  await applyControlPlaneSchema();
  // Vérifie que la connexion de maintenance (utilisée pour CREATE DATABASE) fonctionne dès
  // le démarrage plutôt que d'échouer silencieusement à la première création de boutique.
  await maintenancePool.query('select 1');
  await migrateExistingTenants();
  app.listen(PORT, () => {
    console.log(`API iVente démarrée sur le port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("Échec du démarrage de l'API :", err);
  process.exit(1);
});
