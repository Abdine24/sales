import { Router } from 'express';

export const settingsRouter = Router();

const COLUMNS = [
  'nom_site', 'slogan', 'logo_url', 'email', 'telephone', 'ifu', 'rrcm', 'localite',
  'print_format_default', 'ticket_show_logo', 'ticket_show_vendeur', 'ticket_show_adresse',
  'ticket_show_ifu', 'ticket_show_qrcode', 'ticket_footer_message', 'sound_enabled',
  'whatsapp_enabled', 'whatsapp_custom_message', 'whatsapp_auto_open',
  'receipt_template_id', 'saisie_prix_a_la_vente', 'afficher_remise', 'police_affichage',
];

async function ensureColumns(pool) {
  try {
    await pool.query(`
      alter table settings add column if not exists receipt_template_id text;
      alter table settings add column if not exists saisie_prix_a_la_vente boolean default false;
      alter table settings add column if not exists afficher_remise boolean default true;
      alter table settings add column if not exists logo_data bytea;
      alter table settings add column if not exists logo_mime text;
      alter table settings add column if not exists police_affichage text default 'arial';
    `);
  } catch (err) {
    console.error('ensureColumns settings error:', err);
  }
}

settingsRouter.get('/', async (req, res) => {
  await ensureColumns(req.tenantPool);
  // logo_data (l'image elle-même) n'est jamais renvoyé ici : il est servi par /logo/:slug.
  const { rows } = await req.tenantPool.query("select * from settings where id='principale'");
  if (rows[0]) {
    delete rows[0].logo_data;
    delete rows[0].logo_mime;
  }
  res.json(rows[0] || { id: 'principale', nom_site: 'iVente Pro' });
});

// Dépôt du logo depuis Réglages : image déjà réduite côté navigateur, envoyée en data URL.
// Stockée dans la base de la boutique (sauvegardée avec le reste de ses données) ; logo_url
// pointe ensuite vers la route publique /logo/:slug, avec un ?v= qui change à chaque dépôt.
const LOGO_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const LOGO_MAX_BYTES = 1024 * 1024;

settingsRouter.post('/logo', async (req, res) => {
  await ensureColumns(req.tenantPool);
  const match = /^data:([a-z/]+);base64,(.+)$/i.exec(req.body?.dataUrl || '');
  if (!match || !LOGO_MIMES.has(match[1].toLowerCase())) {
    return res.status(400).json({ error: 'Format non pris en charge — choisis une image PNG, JPEG ou WebP.' });
  }
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0 || buffer.length > LOGO_MAX_BYTES) {
    return res.status(400).json({ error: 'Image trop lourde (1 Mo maximum).' });
  }
  const logoUrl = `${req.protocol}://${req.get('host')}/logo/${req.boutique.slug}?v=${Date.now()}`;
  await req.tenantPool.query(
    `insert into settings (id, logo_data, logo_mime, logo_url) values ('principale', $1, $2, $3)
     on conflict (id) do update set logo_data=excluded.logo_data, logo_mime=excluded.logo_mime, logo_url=excluded.logo_url`,
    [buffer, match[1].toLowerCase(), logoUrl]
  );
  res.json({ logo_url: logoUrl });
});

settingsRouter.delete('/logo', async (req, res) => {
  await ensureColumns(req.tenantPool);
  await req.tenantPool.query(
    "update settings set logo_data=null, logo_mime=null, logo_url=null where id='principale'"
  );
  res.status(204).end();
});

// Upsert complet (l'écran Réglages envoie toujours l'objet entier).
settingsRouter.put('/', async (req, res) => {
  await ensureColumns(req.tenantPool);
  const body = req.body || {};
  const values = COLUMNS.map((c) => body[c] ?? null);
  const insertCols = ['id', ...COLUMNS];
  const insertPlaceholders = insertCols.map((_, i) => `$${i + 1}`);
  const updateClause = COLUMNS.map((c) => `${c}=excluded.${c}`).join(',');
  const { rows } = await req.tenantPool.query(
    `insert into settings (${insertCols.join(',')}) values (${insertPlaceholders.join(',')})
     on conflict (id) do update set ${updateClause}
     returning *`,
    ['principale', ...values]
  );
  delete rows[0].logo_data;
  delete rows[0].logo_mime;
  res.json(rows[0]);
});
