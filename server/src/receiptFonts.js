// Police DM Sans embarquée en local (fichiers .woff2 dans ./fonts/, les mêmes que ceux du site —
// src/assets/fonts) plutôt que chargée depuis Google Fonts — un appel réseau externe pendant le
// rendu Puppeteer/Chromium côté serveur s'est avéré produire des PDF corrompus/gonflés en
// pratique sur le VPS. Chargée UNE SEULE FOIS au démarrage (pas par requête), encodée en base64
// et embarquée directement dans le HTML — aucune requête réseau, aucun chemin de fichier à
// résoudre pour Chromium.
//
// Ce module ne contient AUCUN modèle de facture : depuis que tous les templates sont ajoutés par
// le propriétaire (control_plane.receipt_templates, voir routes/plateforme.js), le serveur n'en
// embarque plus aucun. Il fournit seulement la police, injectée dans le HTML de n'importe quel
// modèle uploadé (voir receiptTemplate.js, sanitizeTemplateHtml).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FONTS_DIR = path.join(__dirname, 'fonts');

export const RECEIPT_FONT_FAMILY = 'DM Sans';

// Un poids absent est simplement ignoré : Chromium choisit alors le poids le plus proche DANS
// LA MÊME famille, sans retomber sur une police système.
const DM_SANS_WEIGHTS = [
  { file: 'DMSans-Regular.woff2', weight: 400 },
  { file: 'DMSans-Medium.woff2', weight: 500 },
  { file: 'DMSans-SemiBold.woff2', weight: 600 },
  { file: 'DMSans-Bold.woff2', weight: 700 },
  { file: 'DMSans-ExtraBold.woff2', weight: 800 },
  { file: 'DMSans-Black.woff2', weight: 900 },
];

function loadFontFaceCss() {
  const faces = DM_SANS_WEIGHTS.map(({ file, weight }) => {
    const filePath = path.join(FONTS_DIR, file);
    if (!fs.existsSync(filePath)) return null;
    const base64 = fs.readFileSync(filePath).toString('base64');
    return (
      `@font-face { font-family: '${RECEIPT_FONT_FAMILY}'; font-style: normal; font-weight: ${weight}; ` +
      `font-display: swap; src: url(data:font/woff2;base64,${base64}) format('woff2'); }`
    );
  }).filter(Boolean);
  return faces.length > 0 ? faces.join('\n') : '';
}

export const RECEIPT_FONT_FACE_CSS = loadFontFaceCss();

// Vrai seulement si au moins un fichier de police a été trouvé — évite de forcer DM Sans dans
// les modèles si les fichiers manquaient.
export const HAS_RECEIPT_FONT = RECEIPT_FONT_FACE_CSS.length > 0;
