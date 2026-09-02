/**
 * Utilitaires pour la génération, le rendu SVG et le bip sonore de codes-barres.
 * Supporte le standard Code 128B universel et EAN-13.
 */

// Table de motifs pour Code 128 (Patterns des barres/espaces)
const CODE128_PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
];

const START_CODE_B = 104;
const STOP_CODE = 106;

/**
 * Encode une chaîne de caractères en motif de barres Code 128B
 */
export function encodeCode128(text: string): string {
  const clean = text.trim() || '000000';
  let checksum = START_CODE_B;
  const patternIndexes = [START_CODE_B];

  for (let i = 0; i < clean.length; i++) {
    const charCode = clean.charCodeAt(i);
    // Code 128B encode ASCII 32 à 126
    const val = charCode >= 32 && charCode <= 126 ? charCode - 32 : 0;
    patternIndexes.push(val);
    checksum += val * (i + 1);
  }

  const checkIndex = checksum % 103;
  patternIndexes.push(checkIndex);
  patternIndexes.push(STOP_CODE);

  return patternIndexes.map((idx) => CODE128_PATTERNS[idx] || '').join('');
}

/**
 * Génère le code HTML SVG d'un code-barres Code 128
 */
export function generateBarcodeSVGString(value: string, height: number = 36): string {
  const pattern = encodeCode128(value || '000000');
  const totalModules = pattern.split('').reduce((sum, char) => sum + parseInt(char, 10), 0);

  let currentX = 0;
  let isBar = true;
  let rectsHtml = '';

  for (let i = 0; i < pattern.length; i++) {
    const moduleCount = parseInt(pattern[i], 10);
    if (isBar) {
      rectsHtml += `<rect x="${currentX}" y="0" width="${moduleCount}" height="${height}" fill="#000" />`;
    }
    currentX += moduleCount;
    isBar = !isBar;
  }

  return `
    <svg viewBox="0 0 ${totalModules} ${height}" style="width: 100%; max-width: 180px; height: 32px; display: block; margin: 0 auto;" preserveAspectRatio="none" shape-rendering="crispEdges">
      ${rectsHtml}
    </svg>
  `;
}

/**
 * Génère un code-barres aléatoire unique au format 13 chiffres (style EAN-13)
 */
export function generateRandomBarcode(): string {
  const prefix = '200'; // Préfixe d'usage interne
  let digits = prefix;
  for (let i = 0; i < 9; i++) {
    digits += Math.floor(Math.random() * 10).toString();
  }

  // Calcul du chiffre de contrôle modulo 10 (EAN-13 check digit)
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const num = parseInt(digits[i], 10);
    sum += i % 2 === 0 ? num : num * 3;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return `${digits}${checkDigit}`;
}

/**
 * Émet un bip sonore de caisse authentique et agréable (sans fichier audio externe)
 */
export function playScanBeep(success: boolean = true) {
  try {
    if (typeof window !== 'undefined' && localStorage.getItem('app_sound_enabled') === 'false') {
      return;
    }

    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (success) {
      // Double bip aigu rapide de caisse moderne
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760, ctx.currentTime); // Note A6
      osc.frequency.setValueAtTime(2637, ctx.currentTime + 0.05); // Note E7
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.12);
    } else {
      // Bip grave d'erreur
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(330, ctx.currentTime);
      osc.frequency.setValueAtTime(220, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch {
    // Ignore audio context autoplay restrictions
  }
}

export interface BarcodeLabelPrintItem {
  nom: string;
  code_barres: string;
  prix: number;
  varianteLabel?: string;
}

export interface DirectPrintOptions {
  labels: BarcodeLabelPrintItem[];
  format: 'a4' | 'thermal';
  storeName?: string;
  showStoreName: boolean;
  showProductName: boolean;
  showPrice: boolean;
}

/**
 * Impression ultra-rapide et isolée via iframe dédiée.
 * Ne bloque pas le navigateur, ne freeze pas l'interface et s'ouvre instantanément.
 */
export function printBarcodeLabelsDirect(options: DirectPrintOptions): void {
  const { labels, format, storeName, showStoreName, showProductName, showPrice } = options;

  // Création d'une iframe cachée éphémère
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    window.print();
    return;
  }

  const gridCss =
    format === 'a4'
      ? `
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      padding: 10px;
      margin: 0;
      width: 100%;
      box-sizing: border-box;
    `
      : `
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 5px;
      margin: 0 auto;
      max-width: 240px;
      box-sizing: border-box;
    `;

  const stickerCardsHtml = labels
    .map((lbl) => {
      const svg = generateBarcodeSVGString(lbl.code_barres);
      return `
      <div class="sticker">
        ${showStoreName ? `<div class="store-name">${storeName || 'Boutique'}</div>` : ''}
        ${showProductName ? `<div class="product-name">${lbl.nom}</div>` : ''}
        ${lbl.varianteLabel ? `<div class="variant-name">${lbl.varianteLabel}</div>` : ''}
        <div class="barcode-box">
          ${svg}
          <div class="barcode-num">${lbl.code_barres}</div>
        </div>
        ${showPrice ? `<div class="price">${Math.round(lbl.prix).toLocaleString('fr-FR')} F</div>` : ''}
      </div>
    `;
    })
    .join('');

  const fullHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Étiquettes Codes-barres</title>
        <style>
          @page {
            size: auto;
            margin: 6mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            margin: 0;
            padding: 0;
            background: #fff;
            color: #000;
          }
          .sheet {
            ${gridCss}
          }
          .sticker {
            border: 1px solid #aaa;
            border-radius: 6px;
            padding: 6px 8px;
            text-align: center;
            background: #fff;
            page-break-inside: avoid;
            break-inside: avoid;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: space-between;
            min-height: 95px;
          }
          .store-name {
            font-size: 8px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #555;
            margin-bottom: 2px;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .product-name {
            font-size: 11px;
            font-weight: 700;
            color: #000;
            line-height: 1.1;
            margin-bottom: 2px;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .variant-name {
            font-size: 10px;
            font-weight: 700;
            color: #4b0082;
            margin-bottom: 2px;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .barcode-box {
            width: 100%;
            margin: 3px 0;
          }
          .barcode-num {
            font-family: "Courier New", Courier, monospace;
            font-size: 9px;
            font-weight: 800;
            letter-spacing: 1.5px;
            color: #000;
            margin-top: 1px;
          }
          .price {
            font-size: 11px;
            font-weight: 900;
            color: #000;
            margin-top: 2px;
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          ${stickerCardsHtml}
        </div>
      </body>
    </html>
  `;

  doc.open();
  doc.write(fullHtml);
  doc.close();

  // Déclencher l'impression immédiatement dès que l'iframe est prête
  iframe.contentWindow?.focus();
  setTimeout(() => {
    try {
      iframe.contentWindow?.print();
    } catch {
      window.print();
    } finally {
      // Nettoyage de l'iframe après déclenchement
      setTimeout(() => iframe.remove(), 2000);
    }
  }, 50);
}
