import { Router } from 'express';
import { controlPlanePool } from '../controlPlaneDb.js';
import { renderReceiptHtml } from '../receiptTemplate.js';
import { htmlToPdf } from '../pdfRenderer.js';

export const facturesRouter = Router();

// Cherche un template par id. Il n'existe PLUS de modèle embarqué dans le serveur : tous les
// modèles sont ceux que le propriétaire a lui-même ajoutés depuis la Console Propriétaire
// (control_plane.receipt_templates, voir routes/plateforme.js). Aucun repli implicite non plus —
// une boutique sans modèle choisi n'imprime pas un modèle "par défaut" surprise, elle reçoit une
// erreur explicite et le client retombe sur son propre rendu (voir src/utils/pdfInvoice.ts).
async function findTemplate(id) {
  if (!id) return null;
  const { rows } = await controlPlanePool.query(
    `select id, nom, html from receipt_templates where id::text = $1`,
    [id]
  );
  return rows[0] || null;
}

// Charge tout ce qu'il faut pour imprimer une facture : la vente (déjà scopée au tenant courant
// via req.tenantPool — une vente d'une AUTRE boutique n'existe simplement pas dans cette base,
// donc `where id=$1` échoue naturellement pour elle, pas besoin d'une vérification séparée),
// ses lignes, et le téléphone du client si connu.
async function loadVenteData(pool, venteId) {
  const { rows: venteRows } = await pool.query('select * from ventes where id=$1', [venteId]);
  if (venteRows.length === 0) return null;
  const vente = venteRows[0];

  const { rows: lignes } = await pool.query(
    `select produit_nom as nom, variante, quantite, prix_unitaire from lignes_vente where vente_id=$1 order by id asc`,
    [venteId]
  );

  let clientTelephone = null;
  if (vente.client_id) {
    const { rows } = await pool.query('select telephone from clients where id=$1', [vente.client_id]);
    clientTelephone = rows[0]?.telephone || null;
  }

  return { vente, lignes, clientTelephone };
}

// Alloue/relit le numéro légal de cette facture et incrémente son compteur d'impressions —
// c'est CE compteur (pas un simple flag) qui détermine "DUPLICATA" : la toute première
// génération du PDF (juste après la vente, ou le tout premier téléchargement) n'est jamais un
// duplicata, toute génération suivante l'est. Le numéro lui-même est alloué à la validation de
// la vente (voir routes/ventes.js), jamais ici.
async function markPrinted(pool, venteId) {
  const { rows } = await pool.query(
    `update factures set nb_impressions = nb_impressions + 1 where vente_id = $1 returning numero, nb_impressions`,
    [venteId]
  );
  if (rows.length === 0) {
    // Vente antérieure à l'introduction de la numérotation légale — aucune ligne `factures`.
    // On ne rattrape pas rétroactivement (un numéro attribué après coup serait hors séquence
    // par rapport à sa vraie date de vente) : le rendu retombe sur l'ancien format #XXXXXXXX
    // (voir receiptTemplate.js, buildScalarTags).
    return { numero: null, duplicata: false };
  }
  return { numero: rows[0].numero, duplicata: rows[0].nb_impressions > 1 };
}

// Aperçu avec des données fictives — utilisé par Réglages > Templates de reçus pour voir un
// modèle avant de le choisir, sans dépendre d'une vraie vente. Utilise les VRAIS réglages de la
// boutique (nom, logo, IFU...) pour un aperçu fidèle, comme avant côté client.
// Déclarée AVANT "/:venteId.pdf" : sinon Express interpréterait "apercu" comme un venteId (le
// paramètre nommé matche n'importe quel segment, y compris "apercu"), et cette route ne serait
// jamais atteinte.
facturesRouter.get('/apercu.pdf', async (req, res) => {
  const templateId = req.query.template_id ? String(req.query.template_id) : null;
  const template = await findTemplate(templateId);
  if (!template) {
    return res.status(404).json({ error: 'Modèle introuvable.' });
  }

  const { rows: settingsRows } = await req.tenantPool.query(`select * from settings where id='principale'`);
  const settings = settingsRows[0] || null;

  const vente = {
    id: 'apercu00',
    date: new Date().toISOString(),
    client_nom: 'Client Exemple',
    total: 12500,
    remise: 500,
    montant_paye: 12500,
    reste_a_payer: 0,
    vendeur_nom: 'Awa Koné',
    vendeur_identifiant: 'EMP-042',
  };
  const lignes = [
    { nom: 'Produit Exemple', variante: 'Bleu / 256 Go', quantite: 2, prix_unitaire: 5000 },
    { nom: 'Autre produit', variante: 'Rouge', quantite: 1, prix_unitaire: 3000 },
  ];

  const html = renderReceiptHtml(template.html, {
    vente,
    lignes,
    clientTelephone: '22671111111',
    settings,
    numero: 'FAC-APERCU-0000',
    duplicata: false,
  });

  try {
    const pdfBuffer = await htmlToPdf(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="Apercu.pdf"');
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Échec de la génération PDF (aperçu) :', err);
    res.status(500).json({ error: 'Échec de la génération du PDF.' });
  }
});

facturesRouter.get('/:venteId.pdf', async (req, res) => {
  const { venteId } = req.params;
  const data = await loadVenteData(req.tenantPool, venteId);
  if (!data) return res.status(404).json({ error: 'Facture introuvable.' });

  const { rows: settingsRows } = await req.tenantPool.query(`select * from settings where id='principale'`);
  const settings = settingsRows[0] || null;

  const template = await findTemplate(settings?.receipt_template_id);
  if (!template) {
    // 409 (et pas 500) : ce n'est pas une panne, c'est une configuration absente — aucun modèle
    // choisi dans Réglages, ou le modèle choisi a été supprimé depuis la Console Propriétaire.
    // Le client distingue ce cas et retombe sur son propre rendu au lieu d'afficher une erreur.
    return res.status(409).json({ error: 'Aucun modèle de facture configuré pour cette boutique.' });
  }

  const { numero, duplicata } = await markPrinted(req.tenantPool, venteId);

  // Un numéro tapé au moment même de l'envoi (ex: client de passage, WhatsApp) prime sur celui
  // enregistré en base — préserve la possibilité déjà offerte côté caisse d'envoyer le reçu à
  // un numéro différent de celui éventuellement sur la fiche client.
  const clientTelephone = (req.query.telephone && String(req.query.telephone)) || data.clientTelephone || undefined;

  const html = renderReceiptHtml(template.html, {
    vente: data.vente,
    lignes: data.lignes,
    clientTelephone,
    settings,
    numero,
    duplicata,
  });

  try {
    const pdfBuffer = await htmlToPdf(html);
    const ref = numero || (data.vente.id || 'recu').substring(0, 8);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Facture-${ref}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Échec de la génération PDF (Puppeteer) :', err);
    res.status(500).json({ error: 'Échec de la génération du PDF.' });
  }
});
