#!/usr/bin/env node
// Génère une clé de licence iVente Pro à partir du terminal (aucune connexion requise).
// Doit rester en phase avec server/src/licence.js (même secret via env, mêmes presets).
//
// Usage :
//   LICENSE_SECRET=... node scripts/generate-license.mjs essai
//   LICENSE_SECRET=... node scripts/generate-license.mjs mois
//   LICENSE_SECRET=... node scripts/generate-license.mjs trimestre
//   LICENSE_SECRET=... node scripts/generate-license.mjs semestre
//   LICENSE_SECRET=... node scripts/generate-license.mjs an
//   LICENSE_SECRET=... node scripts/generate-license.mjs 45   (jours personnalisés, max 365)
//
// Le secret n'est plus codé en dur ici : ce script (et l'API sur le VPS) le lisent depuis
// la variable d'environnement LICENSE_SECRET — jamais commitée, jamais dans le bundle JS
// envoyé au navigateur. Récupère la même valeur que celle déployée sur le VPS (voir
// server/deploy/docker-compose.yml).

import { createHmac, randomBytes } from 'node:crypto';

const LICENSE_SECRET = process.env.LICENSE_SECRET;
if (!LICENSE_SECRET) {
  console.error('Variable LICENSE_SECRET manquante. Usage : LICENSE_SECRET=... node scripts/generate-license.mjs <preset>');
  process.exit(1);
}
const RANDOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Presets d'abonnements : MAXIMUM 1 AN (365 jours) — aucune licence illimitée.
// Doit rester identique à DURATION_PRESET_DAYS dans src/utils/license.ts.
const PRESETS = {
  essai: 7,
  mois: 30,
  trimestre: 90,
  semestre: 180,
  an: 365,
};

const hmacSha256Hex = (message) =>
  createHmac('sha256', LICENSE_SECRET).update(message).digest('hex');

const randomSegment = (length) => {
  const bytes = randomBytes(length);
  return Array.from(bytes).map((b) => RANDOM_ALPHABET[b % RANDOM_ALPHABET.length]).join('');
};

const encodeDuree = (days) => {
  if (!Number.isInteger(days) || days <= 0 || days > 365) {
    throw new Error('La durée doit être un entier entre 1 et 365 jours (maximum 1 an, aucune licence illimitée).');
  }
  return String(days).padStart(4, '0');
};

const generateLicenseKey = (days) => {
  const duree = encodeDuree(days);
  const random = randomSegment(8);
  const sig = hmacSha256Hex(`${duree}.${random}`).slice(0, 8).toUpperCase();
  return `IVTE-${duree}-${random}-${sig}`;
};

const arg = process.argv[2];
if (!arg) {
  console.log('Usage : node scripts/generate-license.mjs <essai|mois|trimestre|semestre|an|<jours>>');
  console.log('\nPresets disponibles :', Object.keys(PRESETS).join(', '));
  console.log('(Maximum 365 jours — aucune licence illimitée n\'est acceptée par l\'application.)');
  process.exit(1);
}

let days;
if (arg in PRESETS) {
  days = PRESETS[arg];
} else if (/^\d+$/.test(arg)) {
  days = parseInt(arg, 10);
} else {
  console.error(`Argument inconnu : "${arg}". Utilise un preset ou un nombre de jours (max 365).`);
  process.exit(1);
}

let key;
try {
  key = generateLicenseKey(days);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

console.log('\nClé de licence générée :');
console.log(`  ${key}`);
console.log(`\nDurée : ${days} jour(s)`);
console.log("À remettre au client pour l'activation ou le renouvellement dans l'app.\n");
