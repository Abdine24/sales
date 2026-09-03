import { apiPostPublic, ApiError } from '../services/api';
import pkg from '../../package.json';

// Système de licences par clé à durée variable.
//
// Format d'une clé : IVTE-<DUREE>-<ALEATOIRE8>-<SIGNATURE8>
//   - DUREE       : un nombre de jours sur 4 chiffres (ex: 0007, 0030, 0365)
//   - ALEATOIRE8  : 8 caractères aléatoires (lisibilité, pas de sécurité)
//   - SIGNATURE8  : 8 premiers caractères hex de HMAC-SHA256("DUREE.ALEATOIRE8", LICENSE_SECRET)
//
// Le secret de signature ne vit plus ici (ni nulle part côté client) — il ne vit que sur le
// serveur (server/src/licence.js, variable d'environnement LICENSE_SECRET). Générer et valider
// une clé nécessite donc désormais une connexion au serveur. Ce fichier ne fait plus que des
// contrôles de format côté client (feedback instantané), la vraie vérification de signature
// se fait exclusivement côté serveur via l'API.

// Lu depuis package.json (source unique) — c'est aussi ce numéro que electron-builder embarque
// dans l'exécutable et que electron-updater compare à la dernière version publiée (voir
// electron/main.cjs et src/components/LicenceSection.tsx). Le faire dériver d'un seul endroit
// évite qu'un oubli de mise à jour ici affiche un numéro de version faux à l'écran.
export const APP_VERSION = pkg.version;
export const APP_RELEASE_NAME = 'iVente Pro Desktop';

// Presets d'abonnements : MAXIMUM 1 AN (365 jours) - Aucune licence illimitée
export type LicenseDurationPreset = 'essai' | 'mois' | 'trimestre' | 'semestre' | 'an';

export const DURATION_PRESET_DAYS: Record<LicenseDurationPreset, number> = {
  essai: 7,
  mois: 30,
  trimestre: 90,
  semestre: 180,
  an: 365, // Maximum 1 an
};

export const DURATION_PRESET_LABELS: Record<LicenseDurationPreset, string> = {
  essai: "Essai gratuit (7 jours)",
  mois: '1 mois (30 jours)',
  trimestre: '3 mois (90 jours)',
  semestre: '6 mois (180 jours)',
  an: '1 an (365 jours - Maximum)',
};

// Demande une clé d'essai gratuite (7 jours) signée par le serveur. Seul preset accessible
// sans être administrateur — les durées payantes se génèrent uniquement via le script CLI
// (scripts/generate-license.mjs), exécuté par l'administrateur de la boutique.
export const requestTrialLicenseKey = async (): Promise<string> => {
  const result = await apiPostPublic<{ cle: string; days: number }>('/licences/essai', {});
  return result.cle;
};

export interface LicenseValidationResult {
  valid: boolean;
  days: number;
  reason?: string;
}

// Contrôle de format rapide, sans appel réseau (feedback immédiat pendant la saisie).
const quickFormatCheck = (key: string): LicenseValidationResult | null => {
  const parts = key.split('-');
  if (parts.length !== 4 || parts[0] !== 'IVTE') {
    return { valid: false, days: 0, reason: 'Format de clé invalide.' };
  }
  const [, duree, random, sig] = parts;
  if (!/^\d{4}$/.test(duree) || !/^[A-Z0-9]{8}$/.test(random) || !/^[A-F0-9]{8}$/.test(sig)) {
    return { valid: false, days: 0, reason: 'Format de clé invalide.' };
  }
  return null; // Format plausible — la vraie vérification se fait côté serveur.
};

// Vérifie une clé de licence auprès du serveur (seul dépositaire du secret de signature).
export const validateLicenseKey = async (rawKey: string): Promise<LicenseValidationResult> => {
  const key = rawKey.trim().toUpperCase();
  const formatError = quickFormatCheck(key);
  if (formatError) return formatError;

  try {
    return await apiPostPublic<LicenseValidationResult>('/licences/valider', { cle: key });
  } catch (err) {
    return {
      valid: false,
      days: 0,
      reason: err instanceof ApiError ? err.message : 'Impossible de vérifier la licence pour le moment.',
    };
  }
};

export const computeExpiryIso = (activatedAtIso: string, days: number): string | null => {
  const activatedAt = new Date(activatedAtIso).getTime();
  if (Number.isNaN(activatedAt)) return null;
  const cappedDays = Math.min(365, Math.max(1, days));
  return new Date(activatedAt + cappedDays * 24 * 60 * 60 * 1000).toISOString();
};

export interface LicenceStatus {
  state: 'absente' | 'valide' | 'expiree';
  daysRemaining: number;
  timeLeftFormatted: string;
  percentageLeft: number;
  totalDays: number;
  expireLe: string | null;
}

export const evaluateLicenceStatus = (licence: {
  activee_le?: string;
  expire_le?: string | null;
  duree_jours?: number | null;
} | null | undefined): LicenceStatus => {
  if (!licence) {
    return {
      state: 'absente',
      daysRemaining: 0,
      timeLeftFormatted: 'Aucune licence active',
      percentageLeft: 0,
      totalDays: 0,
      expireLe: null,
    };
  }

  // Si expire_le n'est pas renseigné ou si ancien format sans durée, borner à 365 jours maximum
  const totalDays = Math.min(365, licence.duree_jours || 365);
  let expireAt: number;

  if (licence.expire_le) {
    expireAt = new Date(licence.expire_le).getTime();
  } else if (licence.activee_le) {
    expireAt = new Date(licence.activee_le).getTime() + totalDays * 24 * 60 * 60 * 1000;
  } else {
    expireAt = Date.now() + 365 * 24 * 60 * 60 * 1000;
  }

  const daysRemaining = Math.max(0, Math.ceil((expireAt - Date.now()) / (1000 * 60 * 60 * 24)));
  const percentageLeft = Math.min(100, Math.max(0, Math.round((daysRemaining / totalDays) * 100)));

  let timeLeftFormatted = '';
  if (daysRemaining <= 0) {
    timeLeftFormatted = 'Expirée (0 jour restant)';
  } else if (daysRemaining === 1) {
    timeLeftFormatted = 'Dernier jour ! (1 jour restant)';
  } else if (daysRemaining < 30) {
    timeLeftFormatted = `${daysRemaining} jours restants`;
  } else {
    const months = Math.floor(daysRemaining / 30);
    const restDays = daysRemaining % 30;
    if (restDays === 0) {
      timeLeftFormatted = `${months} mois restants (${daysRemaining} jours)`;
    } else {
      timeLeftFormatted = `${daysRemaining} jours restants (~${months} mois)`;
    }
  }

  const expireIso = new Date(expireAt).toISOString();

  if (daysRemaining <= 0) {
    return {
      state: 'expiree',
      daysRemaining: 0,
      timeLeftFormatted,
      percentageLeft: 0,
      totalDays,
      expireLe: expireIso,
    };
  }

  return {
    state: 'valide',
    daysRemaining,
    timeLeftFormatted,
    percentageLeft,
    totalDays,
    expireLe: expireIso,
  };
};
