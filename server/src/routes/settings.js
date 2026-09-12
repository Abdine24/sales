import { Router } from 'express';

export const settingsRouter = Router();

const COLUMNS = [
  'nom_site', 'slogan', 'logo_url', 'email', 'telephone', 'ifu', 'rrcm', 'localite',
  'print_format_default', 'ticket_show_logo', 'ticket_show_vendeur', 'ticket_show_adresse',
  'ticket_show_ifu', 'ticket_show_qrcode', 'ticket_footer_message', 'sound_enabled',
  'whatsapp_enabled', 'whatsapp_custom_message', 'whatsapp_auto_open',
  'receipt_template_id', 'saisie_prix_a_la_vente',
];

async function ensureColumns(pool) {
  try {
    await pool.query(`
      alter table settings add column if not exists receipt_template_id text;
      alter table settings add column if not exists saisie_prix_a_la_vente boolean default false;
    `);
  } catch (err) {
    console.error('ensureColumns settings error:', err);
  }
}

settingsRouter.get('/', async (req, res) => {
  await ensureColumns(req.tenantPool);
  const { rows } = await req.tenantPool.query("select * from settings where id='principale'");
  res.json(rows[0] || { id: 'principale', nom_site: 'iVente Pro' });
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
  res.json(rows[0]);
});
