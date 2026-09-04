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

// Déclenche le téléchargement d'un Blob PDF — équivalent de jsPDF's doc.save(), pour le chemin
// qui ne passe plus par jsPDF (le PDF vient déjà tout fait du serveur, voir plus bas).
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Laisse le navigateur démarrer le téléchargement avant de libérer l'URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Message unique pour le cas "aucun modèle" — affiché tel quel à l'utilisateur par les pages
// Caisse / Ventes / Clients. Il n'existe plus de design de facture intégré à l'application :
// une facture A4 vient TOUJOURS d'un modèle ajouté depuis la Console Propriétaire.
export const AUCUN_MODELE_MESSAGE =
  "Aucun modèle de facture n'est configuré pour cette boutique. " +
  'Choisissez-en un dans Réglages → Templates de reçus.';

// Récupère le PDF de la facture, rendu CÔTÉ SERVEUR par Puppeteer/Chromium à partir du modèle
// choisi (voir server/src/routes/factures.js) : texte vectoriel réel, pagination native,
// numérotation légale. Lève une erreur explicite si aucun modèle n'est choisi — il n'y a plus
// de repli sur un design intégré, par choix : seuls les modèles ajoutés par le propriétaire
// peuvent produire une facture.
async function fetchFacturePdf(params: GenerateInvoicePdfParams): Promise<Blob> {
  const templateId = params.settings?.receipt_template_id;
  if (!templateId || !params.vente.id) {
    throw new Error(AUCUN_MODELE_MESSAGE);
  }
  const { apiGetBlob } = await import('../services/api');
  const query = params.clientTelephone ? `?telephone=${encodeURIComponent(params.clientTelephone)}` : '';
  return apiGetBlob(`/factures/${params.vente.id}.pdf${query}`);
}

// Point d'entrée unique pour télécharger une facture/reçu de vente. Lève en cas d'échec (aucun
// modèle, modèle supprimé, API injoignable) : l'appelant doit afficher le message, pas produire
// silencieusement un document différent de celui attendu.
export async function generateReceiptPdf(params: GenerateInvoicePdfParams): Promise<void> {
  const blob = await fetchFacturePdf(params);
  if (params.autoDownload !== false) {
    downloadBlob(blob, `Facture-${params.vente.id.substring(0, 8)}.pdf`);
  }
}

// Envoie un Blob PDF directement à la boîte de dialogue d'impression, sans téléchargement ni
// nouvel onglet : le PDF est chargé dans une iframe cachée, dont on déclenche l'impression.
// C'est le seul moyen d'imprimer un VRAI PDF (celui du modèle, rendu par Chromium côté serveur)
// plutôt que de laisser le navigateur ré-imprimer du HTML avec ses propres marges et sa propre
// pagination. L'iframe est retirée après coup, une fois la boîte de dialogue refermée.
function printBlob(blob: Blob): Promise<boolean> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.src = url;

    const cleanup = () => {
      // Le retrait est différé : arracher l'iframe pendant que la boîte de dialogue est encore
      // ouverte annule l'impression dans Chrome.
      setTimeout(() => {
        iframe.remove();
        URL.revokeObjectURL(url);
      }, 60_000);
    };

    iframe.onload = () => {
      try {
        const win = iframe.contentWindow;
        if (!win) throw new Error('iframe sans contentWindow');
        win.focus();
        win.print();
        cleanup();
        resolve(true);
      } catch (err) {
        // Certains contextes (visionneuse PDF intégrée verrouillée, politique de sécurité)
        // refusent print() sur l'iframe. Plutôt que d'échouer en silence, on ouvre le PDF dans
        // un onglet : l'utilisateur garde le bon document, il lui reste juste Ctrl+P à faire.
        console.warn("Impression directe de l'iframe refusée, ouverture dans un onglet :", err);
        iframe.remove();
        window.open(url, '_blank');
        resolve(true);
      }
    };

    iframe.onerror = () => {
      iframe.remove();
      URL.revokeObjectURL(url);
      resolve(false);
    };

    document.body.appendChild(iframe);
  });
}

/**
 * Imprime la facture A4 — en envoyant à l'imprimante EXACTEMENT le document que produit
 * "Télécharger la facture A4", jamais un rendu différent.
 *
 * C'est tout l'enjeu de cette fonction : imprimer via `window.print()` ferait ré-imprimer au
 * navigateur le HTML du composant ReceiptPrint (le ticket rouleau 80/58mm, juste étiré en A4 par
 * le CSS), avec ses propres marges, sa propre pagination et un pied de page qui ne tombe pas en
 * bas de la feuille. D'où deux documents différents pour le même bouton "A4".
 *
 * Lève la même erreur que le téléchargement quand aucun modèle n'est configuré : les deux
 * boutons réussissent ou échouent ensemble, pour le même document.
 */
export async function printReceiptA4(params: GenerateInvoicePdfParams): Promise<boolean> {
  const blob = await fetchFacturePdf(params);
  return printBlob(blob);
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
