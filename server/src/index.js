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

const PORT = process.env.PORT || 3000;

async function start() {
  // Seule la base de contrôle est initialisée au démarrage — le schéma métier (schema.sql)
  // n'est appliqué qu'aux bases boutiques, une par une, lors de leur provisioning (voir
  // routes/boutiques.js) ou de la bascule initiale (voir server/deploy/README-wildcard-tls.md).
  await applyControlPlaneSchema();
  // Vérifie que la connexion de maintenance (utilisée pour CREATE DATABASE) fonctionne dès
  // le démarrage plutôt que d'échouer silencieusement à la première création de boutique.
  await maintenancePool.query('select 1');
  app.listen(PORT, () => {
    console.log(`API iVente démarrée sur le port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("Échec du démarrage de l'API :", err);
  process.exit(1);
});
