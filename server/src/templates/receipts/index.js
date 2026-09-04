// Bibliothèque de templates de reçus/factures embarqués avec le serveur (voir
// server/src/receiptTemplate.js pour le moteur de rendu, server/src/routes/factures.js pour la
// génération PDF). Pour en ajouter un : dépose un .html dans ce dossier, ajoute une entrée
// ci-dessous, redéploie l'API. Les templates ajoutés dynamiquement par le propriétaire (voir
// server/src/routes/plateforme.js, table control_plane.receipt_templates) sont cherchés en
// complément par getReceiptTemplate() dans factures.js — ce fichier ne gère que les statiques.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Police Inter embarquée en local (fichiers .woff2 dans ./fonts/) plutôt que chargée depuis
// Google Fonts — un appel réseau externe pendant le rendu Puppeteer/Chromium côté serveur s'est
// avéré produire des PDF corrompus/gonflés en pratique sur le VPS (voir historique de
// premium.html). Chargée UNE SEULE FOIS au démarrage (pas par requête), encodée en base64 et
// embarquée directement dans le HTML — aucune requête réseau, aucun chemin de fichier à
// résoudre pour Chromium. Un fichier de poids manquant est simplement ignoré (pas d'erreur) :
// tant qu'aucun fichier n'est présent, la police retombe sur les alternatives système.
const FONTS_DIR = path.join(__dirname, 'fonts');
const INTER_WEIGHTS = [
  { file: 'Inter-Regular.woff2', weight: 400 },
  { file: 'Inter-Medium.woff2', weight: 500 },
  { file: 'Inter-SemiBold.woff2', weight: 600 },
  { file: 'Inter-Bold.woff2', weight: 700 },
];

function loadInterFontFaceCss() {
  const faces = INTER_WEIGHTS.map(({ file, weight }) => {
    const filePath = path.join(FONTS_DIR, file);
    if (!fs.existsSync(filePath)) return null;
    const base64 = fs.readFileSync(filePath).toString('base64');
    return (
      `@font-face { font-family: 'Inter'; font-style: normal; font-weight: ${weight}; ` +
      `font-display: swap; src: url(data:font/woff2;base64,${base64}) format('woff2'); }`
    );
  }).filter(Boolean);
  return faces.length > 0 ? `<style>\n${faces.join('\n')}\n</style>` : '';
}

// Un template qui veut Inter place la balise <!--FONT_FACES--> dans son <head> (voir
// premium.html) ; elle est remplacée ici, une fois pour toutes, par les @font-face ci-dessus —
// ou par une chaîne vide tant qu'aucun fichier n'a été déposé dans ./fonts/.
const INTER_FONT_FACE_CSS = loadInterFontFaceCss();

function loadTemplateHtml(filename) {
  return fs
    .readFileSync(path.join(__dirname, filename), 'utf8')
    .replace('<!--FONT_FACES-->', INTER_FONT_FACE_CSS);
}

export const RECEIPT_TEMPLATES = [
  {
    id: 'premium',
    nom: 'Premium',
    description: 'Fond sombre en en-tête, cartes arrondies, style épuré.',
    html: loadTemplateHtml('premium.html'),
  },
];

export const getStaticTemplate = (id) => RECEIPT_TEMPLATES.find((t) => t.id === id) || null;
