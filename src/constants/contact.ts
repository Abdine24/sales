// Coordonnées de contact affichées publiquement sur le site (écran de connexion, page
// d'accueil de la plateforme...). Un seul endroit à modifier si elles changent.

// TODO: remplacer par le vrai numéro WhatsApp (format international, sans espaces ni "+").
// Exemple pour +226 XX XX XX XX -> "226XXXXXXXX".
export const WHATSAPP_NUMBER = '000000000000';

export const WHATSAPP_CONTACT_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
  'Bonjour, je vous contacte au sujet de iVente Pro.'
)}`;
