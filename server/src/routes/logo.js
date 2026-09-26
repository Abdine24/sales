import { Router } from 'express';
import { controlPlanePool } from '../controlPlaneDb.js';
import { getTenantPool } from '../tenantDb.js';
import { SLUG_RE } from '../tenantResolver.js';

export const logoRouter = Router();

// Public, sans jeton ni en-tête X-Tenant-Host : une balise <img> (menu, ticket, facture PDF
// générée par Puppeteer) ne peut envoyer ni l'un ni l'autre — d'où la boutique dans l'URL.
// Le logo est déposé depuis Réglages (voir settings.js, POST /settings/logo) et stocké dans
// la base de la boutique. L'URL enregistrée dans settings.logo_url porte un paramètre ?v=
// qui change à chaque nouveau dépôt, ce qui permet une mise en cache longue.
logoRouter.get('/:slug', async (req, res) => {
  const slug = String(req.params.slug || '').toLowerCase();
  if (!SLUG_RE.test(slug)) return res.status(404).end();
  try {
    const { rows: boutiques } = await controlPlanePool.query(
      "select db_name from boutiques where slug=$1 and status='active'",
      [slug]
    );
    if (boutiques.length === 0) return res.status(404).end();
    const { rows } = await getTenantPool(boutiques[0].db_name).query(
      "select logo_data, logo_mime from settings where id='principale'"
    );
    const logo = rows[0];
    if (!logo?.logo_data) return res.status(404).end();
    res.set('Content-Type', logo.logo_mime || 'image/png');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(logo.logo_data);
  } catch (err) {
    // Colonne absente (boutique pas encore migrée) ou base injoignable : simplement « pas de logo »
    console.error(`Lecture du logo "${slug}" impossible :`, err.message);
    res.status(404).end();
  }
});
