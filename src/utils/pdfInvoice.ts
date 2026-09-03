import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AppSettings, Vente } from '../db/db';
import { formatCfa } from './currency';

export interface InvoiceItem {
  nom: string;
  variante?: string;
  quantite: number;
  prix_unitaire: number;
}

export interface GenerateInvoicePdfParams {
  vente: Vente;
  lignes: InvoiceItem[];
  clientNom?: string;
  clientTelephone?: string;
  clientAdresse?: string;
  settings?: AppSettings | null;
  autoDownload?: boolean;
}

/**
 * Génère une Facture A4 PDF ultra-professionnelle et la télécharge
 */
export function generateInvoiceA4Pdf({
  vente,
  lignes,
  clientNom,
  clientTelephone,
  clientAdresse,
  settings,
  autoDownload = true,
}: GenerateInvoicePdfParams): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const storeName = settings?.nom_site || 'iVente Store';
  const ref = (vente.id || '').substring(0, 8).toUpperCase();
  const dateStr = new Date(vente.date).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Top Header Banner (Bleu / Slate Moderne)
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, 210, 28, 'F');

  // Titre Société
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(storeName.toUpperCase(), 14, 13);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225); // slate-300
  if (settings?.slogan) {
    doc.text(settings.slogan, 14, 19);
  }

  // Titre Facture Droite
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('FACTURE DE VENTE', 196, 13, { align: 'right' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(147, 197, 253); // blue-300
  doc.text(`N° ${ref}`, 196, 19, { align: 'right' });

  // 2 Blocs : Émetteur (Gauche) & Destinataire Client (Droite)
  let yStart = 38;

  // Émetteur
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('ÉMIS PAR :', 14, yStart);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  let emetteurY = yStart + 5;
  if (settings?.localite) {
    doc.text(`Adresse : ${settings.localite}`, 14, emetteurY);
    emetteurY += 4.5;
  }
  if (settings?.telephone) {
    doc.text(`Tél : ${settings.telephone}`, 14, emetteurY);
    emetteurY += 4.5;
  }
  if (settings?.email) {
    doc.text(`Email : ${settings.email}`, 14, emetteurY);
    emetteurY += 4.5;
  }
  if (settings?.ifu || settings?.rrcm) {
    const fiscal = [settings.ifu ? `IFU : ${settings.ifu}` : '', settings.rrcm ? `RCCM : ${settings.rrcm}` : '']
      .filter(Boolean)
      .join(' | ');
    doc.text(fiscal, 14, emetteurY);
    emetteurY += 4.5;
  }

  // Client (Encadré à droite)
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(120, yStart - 4, 76, 26, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('FACTURÉ À :', 124, yStart + 1);

  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  const nomAffiche = clientNom || vente.client_nom || 'Client Passant';
  doc.text(nomAffiche, 124, yStart + 6);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  let clientY = yStart + 11;
  if (clientTelephone) {
    doc.text(`Tél : ${clientTelephone}`, 124, clientY);
    clientY += 4.5;
  }
  doc.text(`Date : ${dateStr}`, 124, clientY);

  // Tableau des Articles
  const tableData = lignes.map((l, idx) => {
    const designation = l.variante ? `${l.nom}\n${l.variante}` : l.nom;
    const pu = l.prix_unitaire;
    const totalLigne = l.prix_unitaire * l.quantite;
    return [(idx + 1).toString(), designation, l.quantite.toString(), formatCfa(pu), formatCfa(totalLigne)];
  });

  const tableStartY = Math.max(emetteurY, clientY) + 8;

  autoTable(doc, {
    startY: tableStartY,
    head: [['#', 'Désignation des Articles', 'Qté', 'Prix Unitaire', 'Total']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'left',
    },
    styles: {
      fontSize: 8.5,
      cellPadding: 3,
      textColor: [51, 65, 85],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 95 },
      2: { cellWidth: 15, halign: 'center' },
      3: { cellWidth: 35, halign: 'right' },
      4: { cellWidth: 35, halign: 'right', fontStyle: 'bold' },
    },
  });

  // Calcul du bloc des Totaux
  // @ts-ignore
  const finalY = (doc as any).lastAutoTable?.finalY || tableStartY + 40;

  const sousTotal = lignes.reduce((acc, l) => acc + l.prix_unitaire * l.quantite, 0);
  const remise = vente.remise || 0;
  const total = vente.total;
  const paye = vente.montant_paye;
  const reste = vente.reste_a_payer || 0;

  const totalBoxX = 115;
  let curY = finalY + 6;

  // Lignes de totaux
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);

  if (remise > 0) {
    doc.text('Sous-total brut :', totalBoxX, curY);
    doc.text(formatCfa(sousTotal), 196, curY, { align: 'right' });
    curY += 5;

    doc.setTextColor(225, 29, 72); // rose-600
    doc.text('Remise commerciale :', totalBoxX, curY);
    doc.text(`-${formatCfa(remise)}`, 196, curY, { align: 'right' });
    curY += 5;
  }

  // Rectangle TOTAL NET
  doc.setFillColor(241, 245, 249); // slate-100
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(totalBoxX - 2, curY - 1, 83, 10, 1.5, 1.5, 'FD');

  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('TOTAL NET À PAYER :', totalBoxX + 2, curY + 6);
  doc.setTextColor(37, 99, 235); // blue-600
  doc.text(formatCfa(total), 194, curY + 6, { align: 'right' });
  curY += 14;

  // Mode de règlement et statut
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  const modePay =
    (vente.methode_paiement as string) === 'mobile_money'
      ? 'Mobile Money (MTN / Moov / Wave)'
      : (vente.methode_paiement as string) === 'carte'
      ? 'Carte Bancaire'
      : (vente.methode_paiement as string) === 'virement'
      ? 'Virement Bancaire'
      : 'Espèces (Cash)';
  doc.text(`Mode de règlement : ${modePay}`, totalBoxX, curY);
  curY += 4.5;

  doc.text(`Montant réglé : ${formatCfa(paye)}`, totalBoxX, curY);
  curY += 4.5;

  if (reste > 0) {
    doc.setTextColor(225, 29, 72);
    doc.setFont('helvetica', 'bold');
    doc.text(`Reste dû (Crédit) : ${formatCfa(reste)}`, totalBoxX, curY);
  } else if (paye > total) {
    doc.setTextColor(16, 185, 129);
    doc.text(`Monnaie rendue : ${formatCfa(paye - total)}`, totalBoxX, curY);
  }

  // Pied de page / Message de bas de facture
  const pageHeight = doc.internal.pageSize.height;
  doc.setDrawColor(226, 232, 240);
  doc.line(14, pageHeight - 20, 196, pageHeight - 20);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184); // slate-400
  const footerText =
    settings?.ticket_footer_message ||
    'Merci de votre confiance ! Les articles vendus ne sont ni repris ni échangés au-delà de 48 heures.';
  doc.text(footerText, 105, pageHeight - 14, { align: 'center' });
  doc.text(
    `Document généré par ${storeName} le ${new Date().toLocaleDateString('fr-FR')} - Facture originale`,
    105,
    pageHeight - 9,
    { align: 'center' }
  );

  const filename = `Facture_${ref}_${(clientNom || 'Client').replace(/\s+/g, '_')}.pdf`;

  if (autoDownload) {
    doc.save(filename);
  }

  return doc;
}

// Point d'entrée unique pour générer une facture/reçu de vente — bascule vers le moteur de
// templates HTML (voir receiptTemplateEngine.ts, src/templates/receipts/) si la boutique a
// choisi un modèle dans Réglages > Templates de reçus (settings.receipt_template_id), sinon
// garde le design intégré ci-dessus tel quel. Async (le rendu HTML->PDF l'est intrinsèquement,
// via jsPDF.html()) — remplace generateInvoiceA4Pdf dans tous les appels réels de l'app ;
// generateInvoiceA4Pdf reste exporté et utilisable directement (ex: pour un aperçu forcé du
// design "Classique" depuis la galerie de templates).
export async function generateReceiptPdf(params: GenerateInvoicePdfParams): Promise<jsPDF> {
  const templateId = params.settings?.receipt_template_id;
  if (templateId) {
    const { getReceiptTemplate } = await import('../templates/receipts');
    const template = await getReceiptTemplate(templateId);
    if (template) {
      const { renderReceiptPdf } = await import('./receiptTemplateEngine');
      return renderReceiptPdf(
        template.html,
        {
          vente: params.vente,
          lignes: params.lignes,
          clientNom: params.clientNom,
          clientTelephone: params.clientTelephone,
          settings: params.settings,
        },
        params.autoDownload !== false
      );
    }
  }
  return generateInvoiceA4Pdf(params);
}

export interface GenerateDebtReceiptPdfParams {
  reglement: {
    id?: number;
    date: string;
    client_nom: string;
    montant: number;
    mode_paiement: string;
    vendeur_nom?: string;
    vendeur_identifiant?: string;
    dette_avant?: number;
    dette_apres?: number;
    type: string;
    note?: string;
  };
  clientTelephone?: string;
  settings?: AppSettings | null;
  autoDownload?: boolean;
}

/**
 * Génère un Reçu officiel A4 de Règlement / Remboursement
 */
export function generateDebtReceiptA4Pdf({
  reglement,
  clientTelephone,
  settings,
  autoDownload = true,
}: GenerateDebtReceiptPdfParams): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const storeName = settings?.nom_site || 'iVente Store';
  const ref = reglement.id ? `REG-${reglement.id.toString().padStart(5, '0')}` : `REG-${Date.now().toString().slice(-5)}`;
  const dateStr = new Date(reglement.date).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Top Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, 210, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(storeName.toUpperCase(), 14, 13);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  if (settings?.slogan) {
    doc.text(settings.slogan, 14, 19);
  }

  // Titre Reçu Droite
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  const isRetour = reglement.type === 'remboursement_retour';
  doc.text(isRetour ? 'REÇU DE REMBOURSEMENT' : 'REÇU DE RÈGLEMENT DE CRÉANCE', 196, 13, { align: 'right' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(147, 197, 253);
  doc.text(`Réf : ${ref}`, 196, 19, { align: 'right' });

  // Émetteur & Client
  let yStart = 38;

  // Émetteur
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('ÉTABLISSEMENT :', 14, yStart);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  let emetteurY = yStart + 5;
  if (settings?.localite) {
    doc.text(`Adresse : ${settings.localite}`, 14, emetteurY);
    emetteurY += 4.5;
  }
  if (settings?.telephone) {
    doc.text(`Tél : ${settings.telephone}`, 14, emetteurY);
    emetteurY += 4.5;
  }
  if (settings?.ifu || settings?.rrcm) {
    const fiscal = [settings.ifu ? `IFU : ${settings.ifu}` : '', settings.rrcm ? `RCCM : ${settings.rrcm}` : '']
      .filter(Boolean)
      .join(' | ');
    doc.text(fiscal, 14, emetteurY);
    emetteurY += 4.5;
  }

  // Client Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(120, yStart - 4, 76, 26, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('CLIENT CONCERNÉ :', 124, yStart + 1);

  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text(reglement.client_nom, 124, yStart + 6);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  let clientY = yStart + 11;
  if (clientTelephone) {
    doc.text(`Tél : ${clientTelephone}`, 124, clientY);
    clientY += 4.5;
  }
  doc.text(`Date : ${dateStr}`, 124, clientY);

  // Grand Cadre Central du Règlement
  const tableStartY = Math.max(emetteurY, clientY) + 12;

  doc.setFillColor(isRetour ? 254 : 240, isRetour ? 242 : 253, isRetour ? 242 : 244);
  doc.setDrawColor(isRetour ? 254 : 167, isRetour ? 202 : 243, isRetour ? 202 : 208);
  doc.roundedRect(14, tableStartY, 182, 36, 3, 3, 'FD');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text(isRetour ? 'MONTANT DU REMBOURSEMENT EFFECTUÉ' : 'MONTANT DU RÈGLEMENT PERÇU', 105, tableStartY + 10, { align: 'center' });

  doc.setFontSize(22);
  doc.setTextColor(isRetour ? 225 : 16, isRetour ? 29 : 185, isRetour ? 72 : 129);
  doc.text(formatCfa(reglement.montant), 105, tableStartY + 22, { align: 'center' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  const modeLabel =
    reglement.mode_paiement === 'mobile_money'
      ? 'Mobile money'
      : reglement.mode_paiement === 'virement'
      ? 'Virement'
      : 'Espèces';
  doc.text(`Mode de versement : ${modeLabel}`, 105, tableStartY + 30, { align: 'center' });

  // Détails de l'opération
  let curY = tableStartY + 46;

  autoTable(doc, {
    startY: curY,
    head: [['Information', 'Détail']],
    body: [
      ['Date et Heure du paiement', dateStr],
      ['Chez qui (Caissier / Vendeur)', `${reglement.vendeur_nom || 'Caissier'}${reglement.vendeur_identifiant ? ` (ID: ${reglement.vendeur_identifiant})` : ''}`],
      ['Créance avant versement', reglement.dette_avant !== undefined ? formatCfa(reglement.dette_avant) : '—'],
      ['Montant réglé', formatCfa(reglement.montant)],
      ['Solde créance restant dû', reglement.dette_apres !== undefined ? formatCfa(reglement.dette_apres) : '0 F'],
      ['Note / Commentaire', reglement.note || 'Règlement de compte client'],
    ],
    theme: 'striped',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    styles: {
      fontSize: 8.5,
      cellPadding: 3.5,
    },
    columnStyles: {
      0: { cellWidth: 70, fontStyle: 'bold', textColor: [51, 65, 85] },
      1: { cellWidth: 112 },
    },
  });

  // Footer
  const pageHeight = doc.internal.pageSize.height;
  doc.setDrawColor(226, 232, 240);
  doc.line(14, pageHeight - 20, 196, pageHeight - 20);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text('Ce reçu atteste de la bonne réception du paiement ou du remboursement mentionné ci-dessus.', 105, pageHeight - 14, { align: 'center' });
  doc.text(`Document officiel certifié par ${storeName} le ${new Date().toLocaleDateString('fr-FR')}`, 105, pageHeight - 9, { align: 'center' });

  const filename = `${ref}_${(reglement.client_nom || 'Client').replace(/\s+/g, '_')}.pdf`;

  if (autoDownload) {
    doc.save(filename);
  }

  return doc;
}
