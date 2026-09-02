import { createHmac, randomBytes } from 'node:crypto';

// Le secret de signature des licences ne vit désormais QUE côté serveur (variable
// d'environnement, jamais commitée) — plus jamais dans le bundle JS envoyé au navigateur.
// Doit rester en phase avec scripts/generate-license.mjs (même secret via env, même format).
const LICENSE_SECRET = process.env.LICENSE_SECRET;
if (!LICENSE_SECRET) {
  throw new Error('LICENSE_SECRET manquant — nécessaire pour générer/valider les licences.');
}

const RANDOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0/O/1/I

const hmacSha256Hex = (message) => createHmac('sha256', LICENSE_SECRET).update(message).digest('hex');

const randomSegment = (length, bytes) =>
  Array.from(bytes).map((b) => RANDOM_ALPHABET[b % RANDOM_ALPHABET.length]).join('').slice(0, length);

const encodeDuree = (days) => {
  if (!Number.isInteger(days) || days <= 0 || days > 365) {
    throw new Error('La durée doit être un entier entre 1 et 365 jours (maximum 1 an).');
  }
  return String(days).padStart(4, '0');
};

export function generateLicenseKey(days) {
  const duree = encodeDuree(days);
  const random = randomSegment(8, randomBytes(8));
  const sig = hmacSha256Hex(`${duree}.${random}`).slice(0, 8).toUpperCase();
  return `IVTE-${duree}-${random}-${sig}`;
}

export function validateLicenseKey(rawKey) {
  const key = (rawKey || '').trim().toUpperCase();
  const parts = key.split('-');
  if (parts.length !== 4 || parts[0] !== 'IVTE') {
    return { valid: false, days: 0, reason: 'Format de clé invalide.' };
  }
  const [, duree, random, sig] = parts;
  if (!/^\d{4}$/.test(duree)) {
    return { valid: false, days: 0, reason: 'Durée de licence invalide.' };
  }
  const days = parseInt(duree, 10);
  if (days <= 0 || days > 365) {
    return { valid: false, days: 0, reason: 'La durée de la licence ne peut pas dépasser 1 an (365 jours).' };
  }
  if (!/^[A-Z0-9]{8}$/.test(random) || !/^[A-F0-9]{8}$/.test(sig)) {
    return { valid: false, days: 0, reason: 'Format de clé invalide.' };
  }
  const expectedSig = hmacSha256Hex(`${duree}.${random}`).slice(0, 8).toUpperCase();
  if (expectedSig !== sig) {
    return { valid: false, days: 0, reason: 'Clé de licence inconnue ou incorrecte.' };
  }
  return { valid: true, days };
}
