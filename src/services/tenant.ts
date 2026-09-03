// Détection de la boutique (tenant) courante à partir du nom d'hôte du navigateur — voir le
// plan multi-tenant. Chaque boutique vit sur son propre sous-domaine (ex: boutiquea.azanga.tech) ;
// une seule build statique (GitHub Pages) sert toutes les boutiques, donc rien de tout ça ne
// peut être décidé au moment du build (contrairement à VITE_API_URL) — uniquement au chargement,
// depuis window.location.hostname.

const ROOT_DOMAIN = import.meta.env.VITE_ROOT_DOMAIN || 'azanga.tech';

// Étiquettes jamais attribuables à une boutique — le domaine applicatif servi par GitHub Pages.
const RESERVED_LABELS = new Set(['api', 'app', 'www']);

function isLocalhost(): boolean {
  return typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

// Permet de tester la détection de tenant en local (localhost:5173) avant que le DNS
// wildcard n'existe : ?tenant=xxx dans l'URL simule le sous-domaine "xxx.azanga.tech".
function localDevOverride(): string | null {
  if (!isLocalhost()) return null;
  const params = new URLSearchParams(window.location.search);
  return params.get('tenant');
}

// Simule le domaine vitrine de la plateforme en local : ?platform=1 dans l'URL affiche
// l'écran "créer ma boutique" (voir isPlatformLandingHost ci-dessous) sans attendre que
// app.azanga.tech ne soit vraiment branché.
function isLocalPlatformOverride(): boolean {
  if (!isLocalhost()) return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('platform') === '1';
}

function extractSlugFromHost(host: string): string | null {
  const suffix = `.${ROOT_DOMAIN}`;
  if (!host.endsWith(suffix)) return null;
  const label = host.slice(0, -suffix.length);
  if (!label || label.includes('.') || RESERVED_LABELS.has(label)) return null;
  return label;
}

// Le nom d'hôte complet à envoyer au serveur (en-tête X-Tenant-Host), ou null quand aucune
// boutique ne peut être identifiée avec certitude depuis l'URL courante — c'est le cas
// pendant la bascule, tant que le site reste joignable sur son ancienne adresse GitHub Pages
// (abdine24.github.io) en plus des sous-domaines azanga.tech : plutôt que d'envoyer un nom
// d'hôte trompeur, on n'envoie rien du tout, et c'est le filet de sécurité transitoire côté
// serveur (voir tenantResolver.js) qui traite ce cas comme la boutique historique
// "principale" — exactement le comportement d'avant le passage au multi-tenant.
export function getTenantHost(): string | null {
  if (typeof window === 'undefined') return null;
  const override = localDevOverride();
  if (override) return `${override}.${ROOT_DOMAIN}`;
  const host = window.location.hostname;
  if (!host) return null;
  return extractSlugFromHost(host) ? host : null;
}

// Vrai uniquement sur le domaine "vitrine" de la plateforme elle-même (azanga.tech,
// www.azanga.tech, app.azanga.tech) — c'est le SEUL cas qui doit afficher l'écran "créer ma
// boutique" (voir AuthGate.tsx). Un hôte non reconnu pour toute autre raison (ex: encore sur
// l'ancienne adresse GitHub Pages) doit se comporter comme avant : écran de connexion normal,
// résolution de tenant laissée au serveur.
export function isPlatformLandingHost(): boolean {
  if (typeof window === 'undefined') return false;
  if (isLocalPlatformOverride()) return true;
  if (localDevOverride()) return false;
  const host = window.location.hostname;
  return host === ROOT_DOMAIN || Array.from(RESERVED_LABELS).some((label) => host === `${label}.${ROOT_DOMAIN}`);
}

// Construit l'URL vers laquelle rediriger après la création d'une boutique (voir
// AuthGate.tsx). En local, reste sur le serveur de dev avec ?tenant=<slug> (le vrai
// sous-domaine n'existe pas encore tant que le DNS wildcard n'est pas branché) pour pouvoir
// tester tout le parcours d'un seul tenant sans interruption ; en production, le vrai
// sous-domaine.
export function buildBoutiqueUrl(slug: string): string {
  if (isLocalhost()) {
    return `${window.location.origin}/?tenant=${slug}`;
  }
  return `https://${slug}.${ROOT_DOMAIN}/`;
}
