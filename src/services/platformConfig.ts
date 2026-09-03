// Réglages globaux de la plateforme (numéro WhatsApp de contact, téléphone) — éditables
// dynamiquement par le propriétaire depuis l'espace propriétaire (voir
// server/src/routes/plateforme.js, src/pages/OwnerConsole.tsx), jamais en dur dans le code du
// site. Public, sans tenant résolu ni session : appelé dès l'écran de connexion, avant qu'aucune
// boutique ne soit identifiée.
import { apiGetPublic } from './api';

export interface PlatformConfig {
  whatsapp_number: string | null;
  contact_phone: string | null;
}

let cached: PlatformConfig | null = null;
let inflight: Promise<PlatformConfig> | null = null;

export async function getPlatformConfig(): Promise<PlatformConfig> {
  if (cached) return cached;
  if (!inflight) {
    inflight = apiGetPublic<PlatformConfig>('/plateforme/config')
      .then((config) => {
        cached = config;
        return config;
      })
      .catch(() => ({ whatsapp_number: null, contact_phone: null }))
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export const buildWhatsappUrl = (number: string, message: string): string =>
  `https://wa.me/${number}?text=${encodeURIComponent(message)}`;

export const DEFAULT_CONTACT_MESSAGE = 'Bonjour, je vous contacte au sujet de iVente Pro.';
