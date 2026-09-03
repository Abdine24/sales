// Bibliothèque de templates de reçus/factures — voir src/utils/receiptTemplateEngine.ts pour le
// moteur de rendu (balises {tag} + blocs <!--ITEMS-->/<!--IF_TAG-->) et
// src/pages/Settings.tsx ("Templates de reçus") pour la galerie avec aperçu PDF.
//
// Pour ajouter un nouveau modèle : dépose un .html dans ce dossier (mêmes balises, voir
// premium.html comme référence), importe-le ci-dessous avec le suffixe `?raw` (Vite renvoie
// alors son contenu tel quel, en texte — rien à construire), et ajoute une entrée dans
// RECEIPT_TEMPLATES. Aucun autre fichier à toucher : la galerie et la génération PDF les
// découvrent automatiquement depuis cette liste.
import premiumHtml from './premium.html?raw';

export interface ReceiptTemplateMeta {
  id: string;
  nom: string;
  description: string;
  html: string;
}

export const RECEIPT_TEMPLATES: ReceiptTemplateMeta[] = [
  {
    id: 'premium',
    nom: 'Premium',
    description: 'Fond sombre en en-tête, cartes arrondies, style épuré.',
    html: premiumHtml,
  },
];

export const getReceiptTemplate = async (id: string | null | undefined): Promise<ReceiptTemplateMeta | null> => {
  if (!id) return null;
  const local = RECEIPT_TEMPLATES.find((t) => t.id === id);
  if (local) return local;

  try {
    const { apiGetPublic } = await import('../../services/api');
    const templates = await apiGetPublic<ReceiptTemplateMeta[]>('/plateforme/templates/public?includeHtml=true');
    return templates.find((t) => t.id === id) || null;
  } catch (err) {
    console.error('Erreur fetch template dynamique:', err);
    return null;
  }
};
