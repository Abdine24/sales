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

export const RECEIPT_TEMPLATES = [
  {
    id: 'premium',
    nom: 'Premium',
    description: 'Fond sombre en en-tête, cartes arrondies, style épuré.',
    html: fs.readFileSync(path.join(__dirname, 'premium.html'), 'utf8'),
  },
];

export const getStaticTemplate = (id) => RECEIPT_TEMPLATES.find((t) => t.id === id) || null;
