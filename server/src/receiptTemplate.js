// Moteur de rendu des templates de reçus/factures — portage serveur de l'ancien
// src/utils/receiptTemplateEngine.ts (client). Le langage de balises reste identique :
//   - {tag}                        substitution scalaire
//   - <!--ITEMS-->...<!--/ITEMS--> répété une fois par article de la vente ({item_*})
//   - <!--IF_TAG-->...<!--/IF_TAG--> le bloc n'est gardé que si {tag} a une valeur non vide
// Ce qui disparaît par rapport à la version client (plus nécessaire, Chromium natif dans
// Puppeteer gère tout ça correctement) : resolveCssVariablesForCapture, prepareHtmlForCapture,
// withRenderFrame, renderReceiptPdf — voir server/src/pdfRenderer.js pour le rendu PDF lui-même.

const ITEMS_BLOCK_RE = /<!--\s*ITEMS\s*-->([\s\S]*?)<!--\s*\/ITEMS\s*-->/i;
const IF_BLOCK_RE = /<!--\s*IF_([A-Z0-9_]+)\s*-->([\s\S]*?)<!--\s*\/IF_\1\s*-->/gi;

function formatCfa(value) {
  const rounded = Math.round(value || 0);
  return `${rounded.toLocaleString('fr-FR')} F`;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Éclate la variante d'une ligne ("256 Go / Vert Titane", "Rouge, XL"...) en badges séparés —
// le modèle de données n'a qu'un seul champ texte libre par ligne, donc c'est ce découpage qui
// produit un badge par attribut plutôt qu'un seul bloc de texte.
function renderAttrBadges(variante) {
  return (variante || '')
    .split(/[/,]/)
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => `<span class="attr-badge">${escapeHtml(a)}</span>`)
    .join('');
}

export function renderItemsBlock(rowTemplate, lignes) {
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

// data attend : { vente, lignes, clientNom, clientTelephone, settings, numero, duplicata }
//   - vente : ligne de la table `ventes` (voir server/src/schema.sql)
//   - numero : le numéro légal de facture déjà alloué (voir routes/factures.js) — string, ex.
//     "FAC-2026-0007" ; fallback vers l'ancien format #XXXXXXXX si absent (ventes antérieures à
//     l'introduction de la numérotation légale, voir migration).
//   - duplicata : true si ce n'est pas la première impression de cette facture.
export function buildScalarTags(data) {
  const { vente, lignes, clientNom, clientTelephone, settings, numero, duplicata } = data;
  const ref = numero || `#${(vente.id || '').substring(0, 8).toUpperCase()}`;
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
    ref,
    duplicata: duplicata ? 'DUPLICATA' : '',
    sous_total: formatCfa(sousTotal),
    remise: vente.remise ? formatCfa(vente.remise) : '',
    total: formatCfa(vente.total),
    paye: formatCfa(vente.montant_paye),
    reste: vente.reste_a_payer ? formatCfa(vente.reste_a_payer) : '',
    monnaie: vente.montant_paye > vente.total ? formatCfa(vente.montant_paye - vente.total) : '',
  };
}

export function renderReceiptHtml(templateHtml, data) {
  let html = templateHtml;

  const itemsMatch = html.match(ITEMS_BLOCK_RE);
  if (itemsMatch) {
    html = html.replace(ITEMS_BLOCK_RE, renderItemsBlock(itemsMatch[1], data.lignes));
  }

  const tags = buildScalarTags(data);

  // Blocs conditionnels d'abord (sur la base de la valeur BRUTE, avant substitution) — sinon un
  // bloc vidé de son contenu resterait présent dans le HTML final avec une valeur vide affichée.
  html = html.replace(IF_BLOCK_RE, (_match, tagName, inner) => (tags[tagName.toLowerCase()] ? inner : ''));

  for (const [tag, value] of Object.entries(tags)) {
    html = html.replace(new RegExp(`\\{${tag}\\}`, 'gi'), escapeHtml(value));
  }

  return html;
}
