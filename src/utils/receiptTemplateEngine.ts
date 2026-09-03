// Moteur de rendu des templates de reçus/factures en HTML — voir src/templates/receipts/ pour
// la bibliothèque de modèles et src/pages/Settings.tsx ("Templates de reçus") pour la galerie.
//
// Langage de balises volontairement simple (pas de vraie librairie de templating) :
//   - {tag}                        substitution scalaire (voir SCALAR_TAGS ci-dessous)
//   - <!--ITEMS-->...<!--/ITEMS--> répété une fois par article de la vente (balises {item_*})
//   - <!--IF_TAG-->...<!--/IF_TAG--> le bloc n'est gardé que si {tag} a une valeur non vide
//     (ex: <!--IF_SLOGAN-->...{slogan}...<!--/IF_SLOGAN--> disparaît si aucun slogan renseigné)
// Les mêmes noms de balises scalaires que le message WhatsApp personnalisé (client, boutique,
// total, date, ref, remise, paye, reste) sont réutilisés à l'identique — un seul vocabulaire à
// connaître dans toute l'app.
import jsPDF from 'jspdf';
import { AppSettings, Vente } from '../db/db';
import { formatCfa } from './currency';
import type { InvoiceItem } from './pdfInvoice';

export interface ReceiptTemplateData {
  vente: Vente;
  lignes: InvoiceItem[];
  clientNom?: string;
  clientTelephone?: string;
  settings?: AppSettings | null;
}

const ITEMS_BLOCK_RE = /<!--\s*ITEMS\s*-->([\s\S]*?)<!--\s*\/ITEMS\s*-->/i;
const IF_BLOCK_RE = /<!--\s*IF_([A-Z0-9_]+)\s*-->([\s\S]*?)<!--\s*\/IF_\1\s*-->/gi;

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Éclate la variante d'une ligne ("256 Go / Vert Titane", "Rouge, XL"...) en badges séparés —
// le modèle de données n'a qu'un seul champ texte libre par ligne (voir InvoiceItem), donc
// c'est ce découpage qui produit un badge par attribut plutôt qu'un seul bloc de texte.
function renderAttrBadges(variante: string | undefined): string {
  return (variante || '')
    .split(/[/,]/)
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => `<span class="attr-badge">${escapeHtml(a)}</span>`)
    .join('');
}

function renderItemsBlock(rowTemplate: string, lignes: InvoiceItem[]): string {
  return lignes
    .map((l, index) => {
      const total = l.prix_unitaire * l.quantite;
      return rowTemplate
        .replace(/\{item_index\}/gi, String(index + 1))
        .replace(/\{item_nom\}/gi, escapeHtml(l.nom))
        .replace(/\{item_attributs\}/gi, renderAttrBadges(l.variante))
        .replace(/\{item_qte\}/gi, String(l.quantite))
        .replace(/\{item_prix_unitaire\}/gi, formatCfa(l.prix_unitaire))
        .replace(/\{item_total\}/gi, formatCfa(total));
    })
    .join('');
}

function buildScalarTags(data: ReceiptTemplateData): Record<string, string> {
  const { vente, lignes, clientNom, clientTelephone, settings } = data;
  const ref = (vente.id || '').substring(0, 8).toUpperCase();
  const dateStr = new Date(vente.date).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const sousTotal = lignes.reduce((acc, l) => acc + l.prix_unitaire * l.quantite, 0);

  return {
    boutique: settings?.nom_site || 'iVente Store',
    slogan: settings?.slogan || '',
    logo: settings?.logo_url || '',
    adresse: settings?.localite || '',
    telephone_boutique: settings?.telephone || '',
    email_boutique: settings?.email || '',
    ifu: settings?.ifu || '',
    rccm: settings?.rrcm || '',
    client: clientNom?.trim() || vente.client_nom?.trim() || 'Client',
    telephone_client: clientTelephone || '',
    // "Émetteur" = l'employé qui a réalisé la vente, pas la boutique elle-même (déjà affichée
    // dans l'en-tête) — voir vente.vendeur_nom/vendeur_identifiant, dénormalisés sur la vente au
    // moment de l'encaissement.
    vendeur_nom: vente.vendeur_nom || '',
    vendeur_code: vente.vendeur_identifiant || '',
    date: dateStr,
    ref: `#${ref}`,
    sous_total: formatCfa(sousTotal),
    remise: vente.remise ? formatCfa(vente.remise) : '',
    total: formatCfa(vente.total),
    paye: formatCfa(vente.montant_paye),
    reste: vente.reste_a_payer ? formatCfa(vente.reste_a_payer) : '',
    monnaie: vente.montant_paye > vente.total ? formatCfa(vente.montant_paye - vente.total) : '',
  };
}

// Rend un template en HTML final (balises remplacées, blocs conditionnels résolus) — exporté
// séparément de renderReceiptPdf pour permettre un futur aperçu HTML direct (pas seulement PDF)
// sans dupliquer la logique.
export function renderReceiptHtml(templateHtml: string, data: ReceiptTemplateData): string {
  let html = templateHtml;

  const itemsMatch = html.match(ITEMS_BLOCK_RE);
  if (itemsMatch) {
    html = html.replace(ITEMS_BLOCK_RE, renderItemsBlock(itemsMatch[1], data.lignes));
  }

  const tags = buildScalarTags(data);

  // Blocs conditionnels d'abord (sur la base de la valeur BRUTE, avant substitution) — sinon un
  // bloc vidé de son contenu resterait présent dans le HTML final avec une valeur vide affichée.
  html = html.replace(IF_BLOCK_RE, (_match, tagName: string, inner: string) =>
    tags[tagName.toLowerCase()] ? inner : ''
  );

  for (const [tag, value] of Object.entries(tags)) {
    html = html.replace(new RegExp(`\\{${tag}\\}`, 'gi'), escapeHtml(value));
  }

  return html;
}

// html2canvas (utilisé par jsPDF.html(), voir renderReceiptPdf) ne résout pas de façon fiable
// les variables CSS (`var(--nom)`) — limitation connue du projet, pas de notre moteur. Un
// template peut légitimement utiliser des variables CSS pour rester lisible et facile à
// modifier (voir premium.html, entièrement construit autour de `:root { --primary-dark: ...}`) ;
// pour que ça capture correctement, on les résout nous-mêmes en valeurs littérales AVANT de
// transmettre le HTML à html2canvas — le fichier source du template, lui, n'est jamais modifié.
function resolveCssVariablesForCapture(html: string): string {
  const declRe = /--([\w-]+)\s*:\s*([^;{}]+);/g;
  const vars: Record<string, string> = {};
  let decl: RegExpExecArray | null;
  while ((decl = declRe.exec(html))) {
    vars[decl[1]] = decl[2].trim();
  }
  if (Object.keys(vars).length === 0) return html;

  // Jusqu'à 3 passes : une valeur de variable peut elle-même référencer une autre variable.
  let result = html;
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    result = result.replace(/var\(\s*--([\w-]+)\s*(?:,\s*([^)]+))?\)/g, (full, name, fallback) => {
      if (vars[name] !== undefined) {
        changed = true;
        return vars[name];
      }
      return fallback !== undefined ? fallback.trim() : full;
    });
    if (!changed) break;
  }
  return result;
}

// Neutralise, UNIQUEMENT pour la capture PDF, les styles pensés pour un aperçu écran flottant
// (ombre, coins arrondis, marge, fond gris derrière la page) — sans jamais toucher au fichier
// source du template, qui garde son rendu d'origine si on l'ouvre normalement dans un
// navigateur. Ajouté en dernier dans <head> pour gagner la cascade sur les règles du template.
const CAPTURE_OVERRIDE_STYLE = `<style>
  body { background: #ffffff !important; }
  .a4-page { margin: 0 !important; box-shadow: none !important; border-radius: 0 !important; }
</style>`;

function prepareHtmlForCapture(html: string): string {
  const withResolvedVars = resolveCssVariablesForCapture(html);
  return /<\/head>/i.test(withResolvedVars)
    ? withResolvedVars.replace(/<\/head>/i, `${CAPTURE_OVERRIDE_STYLE}</head>`)
    : CAPTURE_OVERRIDE_STYLE + withResolvedVars;
}

// Rend un document HTML complet (DOCTYPE/head/body) dans un <iframe> détaché plutôt que dans le
// document principal — le <style> d'un template peut contenir des sélecteurs génériques
// (body, table, th, td...) qui pollueraient toute l'app s'ils étaient injectés directement dans
// le DOM visible pendant la génération. L'iframe est un document totalement isolé : son CSS ne
// peut jamais fuiter vers la page hôte.
async function withRenderFrame<T>(html: string, fn: (frameDocument: Document) => Promise<T>): Promise<T> {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '794px'; // 210mm à 96dpi
  iframe.style.height = '1123px'; // 297mm à 96dpi
  document.body.appendChild(iframe);
  try {
    const frameDoc = iframe.contentDocument;
    if (!frameDoc) throw new Error("Impossible de préparer le rendu du modèle.");
    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();
    // Laisse le temps aux polices Google Fonts (liées en <head>) de se charger — best-effort,
    // un léger délai suffit pour ce cas d'usage (pas de vraie API cross-frame fiable partout).
    await new Promise((resolve) => setTimeout(resolve, 300));
    return await fn(frameDoc);
  } finally {
    document.body.removeChild(iframe);
  }
}

// Génère le PDF A4 à partir d'un template + des données de la vente, et le télécharge (sauf
// autoDownload:false). S'appuie sur jsPDF.html() (html2canvas + dompurify, déjà présents dans
// les dépendances du projet) — aucune nouvelle dépendance nécessaire.
export async function renderReceiptPdf(
  templateHtml: string,
  data: ReceiptTemplateData,
  autoDownload = true
): Promise<jsPDF> {
  const html = prepareHtmlForCapture(renderReceiptHtml(templateHtml, data));
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  await withRenderFrame(html, async (frameDoc) => {
    await new Promise<void>((resolve, reject) => {
      try {
        doc.html(frameDoc.body, {
          callback: () => resolve(),
          x: 0,
          y: 0,
          width: 210,
          windowWidth: 794,
        });
      } catch (err) {
        reject(err);
      }
    });
  });

  if (autoDownload) {
    const ref = (data.vente.id || 'recu').substring(0, 8);
    doc.save(`Facture-${ref}.pdf`);
  }
  return doc;
}
