import { Router } from 'express';
import { pool } from '../db.js';

export const settingsRouter = Router();

const COLUMNS = [
  'nom_site', 'slogan', 'logo_url', 'email', 'telephone', 'ifu', 'rrcm', 'localite',
  'print_format_default', 'ticket_show_logo', 'ticket_show_vendeur', 'ticket_show_adresse',
  'ticket_show_ifu', 'ticket_show_qrcode', 'ticket_footer_message', 'sound_enabled',
  'whatsapp_enabled', 'whatsapp_custom_message', 'whatsapp_auto_open',
];

settingsRouter.get('/', async (_req, res) => {
  const { rows } = await pool.query("select * from settings where id='principale'");
  res.json(rows[0] || { id: 'principale', nom_site: 'iVente Pro' });
});

// Upsert complet (l'écran Réglages envoie toujours l'objet entier).
settingsRouter.put('/', async (req, res) => {
  const body = req.body || {};
  const values = COLUMNS.map((c) => body[c] ?? null);
  const insertCols = ['id', ...COLUMNS];
  const insertPlaceholders = insertCols.map((_, i) => `$${i + 1}`);
  const updateClause = COLUMNS.map((c) => `${c}=excluded.${c}`).join(',');
  const { rows } = await pool.query(
    `insert into settings (${insertCols.join(',')}) values (${insertPlaceholders.join(',')})
     on conflict (id) do update set ${updateClause}
     returning *`,
    ['principale', ...values]
  );
  res.json(rows[0]);
});
