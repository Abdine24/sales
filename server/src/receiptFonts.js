// Police Inter embarquée en local (fichiers .woff2 dans ./fonts/) plutôt que chargée depuis
// Google Fonts — un appel réseau externe pendant le rendu Puppeteer/Chromium côté serveur s'est
// avéré produire des PDF corrompus/gonflés en pratique sur le VPS. Chargée UNE SEULE FOIS au
// démarrage (pas par requête), encodée en base64 et embarquée directement dans le HTML — aucune
// requête réseau, aucun chemin de fichier à résoudre pour Chromium.
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

// Seuls Regular (400) et Medium (500) sont fournis. Ce n'est pas un manque : quand un élément
// demande un poids absent (600/700), Chromium applique l'algorithme de correspondance CSS et
// choisit le poids le PLUS PROCHE **dans la même famille** — donc Medium, en vraie Inter — au
// lieu de retomber sur une police système différente. Aucun mélange de polices à l'écran.
// Ajouter Inter-SemiBold.woff2 / Inter-Bold.woff2 ici les activerait automatiquement.
const INTER_WEIGHTS = [
  { file: 'Inter-Regular.woff2', weight: 400 },
  { file: 'Inter-Medium.woff2', weight: 500 },
  { file: 'Inter-SemiBold.woff2', weight: 600 },
  { file: 'Inter-Bold.woff2', weight: 700 },
];

function loadInterFontFaceCss() {
  const faces = INTER_WEIGHTS.map(({ file, weight }) => {
    const filePath = path.join(FONTS_DIR, file);
    // Un fichier de poids manquant est simplement ignoré (pas d'erreur au démarrage).
    if (!fs.existsSync(filePath)) return null;
    const base64 = fs.readFileSync(filePath).toString('base64');
    return (
      `@font-face { font-family: 'Inter'; font-style: normal; font-weight: ${weight}; ` +
      `font-display: swap; src: url(data:font/woff2;base64,${base64}) format('woff2'); }`
    );
  }).filter(Boolean);
  return faces.length > 0 ? faces.join('\n') : '';
}

export const INTER_FONT_FACE_CSS = loadInterFontFaceCss();

// Vrai seulement si au moins un fichier de police a été trouvé — évite d'injecter un <style>
// vide, et permet à l'appelant de ne pas forcer 'Inter' dans la pile de polices pour rien.
export const HAS_INTER = INTER_FONT_FACE_CSS.length > 0;
