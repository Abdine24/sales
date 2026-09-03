import { AppSettings, Vente, Reglement } from '../db/db';
import { formatCfa } from './currency';
import { generateInvoiceA4Pdf, generateDebtReceiptA4Pdf, InvoiceItem } from './pdfInvoice';

/**
 * Nettoie et formate un numéro de téléphone pour WhatsApp
 */
export function cleanPhoneNumber(phone: string): string {
  if (!phone) return '';
  // Enlève espaces, tirets, parenthèses, points
  let cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }
  return cleaned;
}

export interface WhatsAppReceiptParams {
  vente: Vente;
  lignes: InvoiceItem[];
  clientTelephone?: string;
  clientNom?: string;
  settings?: AppSettings | null;
  downloadPdf?: boolean;
}

/**
 * Génère la chaîne formatée des produits et de leurs prix
 */
export function formatProductsList(lignes: InvoiceItem[]): string {
  if (!lignes || lignes.length === 0) return 'Aucun article';

  return lignes
    .map((l) => {
      const varSuffix = l.variante ? ` (${l.variante})` : '';
      const totalLigne = l.prix_unitaire * l.quantite;
      return `* ${l.quantite}x ${l.nom}${varSuffix} : ${formatCfa(totalLigne)} (${formatCfa(l.prix_unitaire)}/unité)`;
    })
    .join('\n');
}

// Le message par défaut salue différemment selon l'heure de la vente — "Bonsoir" à partir de
// 14h (convention voulue pour ce commerce), "Bonjour" avant.
function greetingFor(date: string | Date): string {
  return new Date(date).getHours() >= 14 ? 'Bonsoir' : 'Bonjour';
}

/**
 * Génère le texte élégant du reçu pour WhatsApp avec support des balises {client}, {produit}, {total}, etc.
 */
export function generateWhatsAppReceiptText({
  vente,
  lignes,
  clientNom,
  settings,
}: WhatsAppReceiptParams): string {
  const storeName = settings?.nom_site || 'Notre Boutique';
  const clientNameDisplay = clientNom?.trim() || vente.client_nom?.trim() || 'cher(e) client(e)';

  const dateStr = new Date(vente.date).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const ref = (vente.id || '').substring(0, 8).toUpperCase();
  const formattedProducts = formatProductsList(lignes);
  const totalFormatted = formatCfa(vente.total);
  const payeFormatted = formatCfa(vente.montant_paye);
  const remiseFormatted = vente.remise ? formatCfa(vente.remise) : '0 F';
  const resteFormatted = vente.reste_a_payer ? formatCfa(vente.reste_a_payer) : '0 F';

  const userTemplate = settings?.whatsapp_custom_message?.trim();

  // Si l'utilisateur a personnalisé le message avec des balises de template
  if (userTemplate) {
    let customized = userTemplate
      .replace(/\{client\}/gi, clientNameDisplay)
      .replace(/\{boutique\}/gi, storeName)
      .replace(/\{total\}/gi, totalFormatted)
      .replace(/\{remise\}/gi, remiseFormatted)
      .replace(/\{paye\}/gi, payeFormatted)
      .replace(/\{reste\}/gi, resteFormatted)
      .replace(/\{ref\}/gi, `#${ref}`)
      .replace(/\{date\}/gi, dateStr);

    // Si la balise {produit} ou {produits} est présente dans le template
    if (/\{produits?\}/i.test(customized)) {
      customized = customized.replace(/\{produits?\}/gi, formattedProducts);
    } else {
      // Sinon, on concatène proprement les produits et totaux
      customized += `\n\n📦 *DÉTAIL DE VOS ARTICLES :*\n${formattedProducts}\n\n💰 *TOTAL RÉGLÉ : ${totalFormatted}*`;
    }

    // Mention du PDF joint
    customized += `\n\n📎 _Veuillez trouver ci-joint votre facture officielle A4 (PDF)._`;
    if (settings?.telephone) {
      customized += `\n📞 Service client : ${settings.telephone}`;
    }

    return (
      `🧾 *FACTURE / REÇU - ${storeName.toUpperCase()}*\n` +
      `📅 Date : ${dateStr} | Réf : #${ref}\n\n` +
      customized
    );
  }

  // Template par défaut — texte brut, sans emoji, salutation adaptée à l'heure de la vente.
  let totalsSection = `━━━━━━━━━━━━━━━━━━━━━\n`;
  totalsSection += `TOTAL : ${totalFormatted}\n`;
  if (vente.remise && vente.remise > 0) {
    totalsSection += `Remise : ${remiseFormatted}\n`;
  }
  totalsSection += `Montant payé : ${payeFormatted}\n`;

  if (vente.reste_a_payer && vente.reste_a_payer > 0) {
    totalsSection += `Reste dû (Crédit) : ${resteFormatted}\n`;
  } else if (vente.montant_paye > vente.total) {
    totalsSection += `Monnaie rendue : ${formatCfa(vente.montant_paye - vente.total)}\n`;
  }

  let footerSection = `━━━━━━━━━━━━━━━━━━━━━\n`;
  if (settings?.slogan) {
    footerSection += `${settings.slogan}\n`;
  }
  if (settings?.telephone) {
    footerSection += `Contact : ${settings.telephone}\n`;
  }
  footerSection += `\nVotre facture complète au format PDF A4 est en pièce jointe.\n`;
  footerSection += `Merci pour votre fidélité et à très bientôt chez ${storeName} !`;

  return (
    `REÇU D'ACHAT - ${storeName.toUpperCase()}\n` +
    `Date : ${dateStr}\n` +
    `Réf : #${ref}\n\n` +
    `${greetingFor(vente.date)} ${clientNameDisplay}, toute notre équipe vous remercie chaleureusement pour votre achat et votre confiance !\n\n` +
    `Détails des articles\n\n` +
    `${formattedProducts}\n\n` +
    `${totalsSection}` +
    `${footerSection}`
  );
}

/**
 * Génère la facture A4 PDF ET ouvre WhatsApp avec le message
 */
export function openWhatsAppReceipt(params: WhatsAppReceiptParams): boolean {
  const phone = cleanPhoneNumber(params.clientTelephone || '');
  if (!phone) return false;

  // 1. Génère et télécharge automatiquement la facture A4 en PDF si demandé
  if (params.downloadPdf !== false) {
    try {
      generateInvoiceA4Pdf({
        vente: params.vente,
        lignes: params.lignes,
        clientNom: params.clientNom,
        clientTelephone: params.clientTelephone,
        settings: params.settings,
        autoDownload: true,
      });
    } catch (e) {
      console.warn('Erreur lors de la génération du PDF facture A4:', e);
    }
  }

  // 2. Ouvre WhatsApp avec le texte complet contenant le nom du client et les détails des produits
  const text = generateWhatsAppReceiptText(params);
  const encodedText = encodeURIComponent(text);
  const whatsappUrl = `https://wa.me/${phone}?text=${encodedText}`;

  window.open(whatsappUrl, '_blank');
  return true;
}

export interface WhatsAppDebtReceiptParams {
  reglement: Reglement;
  clientTelephone?: string;
  settings?: AppSettings | null;
  downloadPdf?: boolean;
}

/**
 * Rédige le texte du reçu de règlement pour WhatsApp
 */
export function generateDebtReceiptText({ reglement, settings }: WhatsAppDebtReceiptParams): string {
  const storeName = settings?.nom_site || 'iVente Pro';
  const isRetour = reglement.type === 'remboursement_retour';
  const ref = reglement.id ? `REG-${reglement.id.toString().padStart(5, '0')}` : `REG-${Date.now().toString().slice(-5)}`;
  const dateStr = new Date(reglement.date).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const modeLabel =
    reglement.mode_paiement === 'mobile_money'
      ? 'Mobile money'
      : reglement.mode_paiement === 'virement'
      ? 'Virement'
      : 'Espèces';

  let text = `🧾 *${isRetour ? 'REÇU DE REMBOURSEMENT' : 'ACCUSÉ DE RÈGLEMENT'} - ${storeName.toUpperCase()}*\n`;
  text += `📅 Date : ${dateStr}\n`;
  text += `🔖 Réf : #${ref}\n\n`;
  text += `Bonjour *${reglement.client_nom}*,\n\n`;
  text += isRetour
    ? `Nous vous confirmons le remboursement de *${formatCfa(reglement.montant)}* sur votre dossier.\n\n`
    : `Nous accusons bonne réception de votre versement de *${formatCfa(reglement.montant)}* sur votre compte client.\n\n`;

  text += `💵 *DÉTAIL DU RÈGLEMENT :*\n`;
  text += `• Montant : *${formatCfa(reglement.montant)}*\n`;
  text += `• Mode : ${modeLabel}\n`;
  if (reglement.vendeur_nom) {
    text += `• Encaissé par : *${reglement.vendeur_nom}*\n`;
  }
  if (reglement.dette_avant !== undefined) {
    text += `• Créance précédente : ${formatCfa(reglement.dette_avant)}\n`;
  }
  if (reglement.dette_apres !== undefined) {
    text += `• *Nouveau solde dû : ${formatCfa(reglement.dette_apres)}*\n`;
  }
  if (reglement.note) {
    text += `• Note : _${reglement.note}_\n`;
  }

  text += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
  if (settings?.slogan) text += `📍 _${settings.slogan}_\n`;
  if (settings?.telephone) text += `📞 Contact : ${settings.telephone}\n`;
  text += `\n📎 _Votre reçu officiel A4 (PDF) est en pièce jointe._\n`;
  text += `Merci pour votre confiance et à bientôt chez *${storeName}* ! ✨`;

  return text;
}

/**
 * Ouvre WhatsApp avec le reçu de règlement et télécharge le PDF A4 officiel
 */
export async function openWhatsAppDebtReceipt(params: WhatsAppDebtReceiptParams): Promise<boolean> {
  const phone = cleanPhoneNumber(params.clientTelephone || '');
  const text = generateDebtReceiptText(params);

  let pdfDoc: any = null;
  if (params.downloadPdf !== false) {
    try {
      pdfDoc = generateDebtReceiptA4Pdf({
        reglement: params.reglement,
        clientTelephone: params.clientTelephone,
        settings: params.settings,
        autoDownload: false,
      });
    } catch (e) {
      console.warn('Erreur lors de la génération du reçu de dette PDF:', e);
    }
  }

  // Partage mobile (Web Share API)
  if (pdfDoc && typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
    try {
      const pdfBlob = pdfDoc.output('blob');
      const ref = params.reglement.id ? `REG-${params.reglement.id}` : 'Recu_Reglement';
      const filename = `${ref}_${(params.reglement.client_nom || 'Client').replace(/\s+/g, '_')}.pdf`;
      const file = new File([pdfBlob], filename, { type: 'application/pdf' });

      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `Reçu Règlement`,
          text: text,
          files: [file],
        });
        return true;
      }
    } catch {
      // fallback
    }
  }

  // Desktop download + WhatsApp Web
  if (pdfDoc) {
    const ref = params.reglement.id ? `REG-${params.reglement.id}` : 'Recu_Reglement';
    const filename = `${ref}_${(params.reglement.client_nom || 'Client').replace(/\s+/g, '_')}.pdf`;
    pdfDoc.save(filename);
  }

  if (phone) {
    const encodedText = encodeURIComponent(text);
    const whatsappUrl = `https://wa.me/${phone}?text=${encodedText}`;
    window.open(whatsappUrl, '_blank');
    return true;
  }

  return false;
}
