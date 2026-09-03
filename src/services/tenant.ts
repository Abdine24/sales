// Détection de la boutique (tenant) courante à partir du nom d'hôte du navigateur — voir le
// plan multi-tenant. Chaque boutique vit sur son propre sous-domaine (ex: boutiquea.azanga.tech) ;
// une seule build statique (GitHub Pages) sert toutes les boutiques, donc rien de tout ça ne
// peut être décidé au moment du build (contrairement à VITE_API_URL) — uniquement au chargement,
// depuis window.location.hostname.

// Étiquettes jamais attribuables à une boutique — le domaine racine lui-même (page vitrine /
// création de boutique) et le sous-domaine applicatif servi par GitHub Pages.
const RESERVED_LABELS = new Set(['api', 'app', 'www']);

// Permet de tester la détection de tenant en local (localhost:5173) avant que le DNS
// wildcard n'existe : ?tenant=xxx dans l'URL simule le sous-domaine "xxx.azanga.tech".
function localDevOverride(): string | null {
  if (typeof window === 'undefined') return null;
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (!isLocal) return null;
  const params = new URLSearchParams(window.location.search);
  return params.get('tenant');
}

// Le nom d'hôte complet à envoyer au serveur (en-tête X-Tenant-Host) — c'est le serveur qui
// fait la résolution (slug de sous-domaine aujourd'hui, domaine personnalisé plus tard), pas
// le client : aucun changement ici ne sera nécessaire quand les domaines personnalisés
// arriveront, puisque le client se contente de transmettre ce qu'il voit dans la barre
// d'adresse.
export function getTenantHost(): string | null {
  if (typeof window === 'undefined') return null;
  const override = localDevOverride();
  if (override) return `${override}.azanga.tech`;
  return window.location.hostname || null;
}

// Vrai uniquement quand aucune boutique ne peut être déterminée depuis l'URL courante — c'est
// l'état "page d'accueil / création de boutique" (voir AuthGate.tsx), pas une erreur.
export function hasResolvableTenant(): boolean {
  const host = getTenantHost();
  if (!host) return false;
  if (['localhost', '127.0.0.1'].includes(host) && !localDevOverride()) return false;
  const parts = host.split('.');
  if (parts.length < 3) return false;
  return !RESERVED_LABELS.has(parts[0]);
}

// Construit l'URL absolue de la boutique nouvellement créée, pour la redirection après
// POST /boutiques (voir AuthGate.tsx) — toujours le vrai domaine de prod, jamais un
// override local, puisque c'est une navigation dure vers le sous-domaine réel.
export function buildBoutiqueUrl(slug: string): string {
  const rootDomain = import.meta.env.VITE_ROOT_DOMAIN || 'azanga.tech';
  return `https://${slug}.${rootDomain}/`;
}
