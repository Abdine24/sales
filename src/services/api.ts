// Client minimal pour l'API métier hébergée sur le VPS. Point d'entrée unique qui sera
// réutilisé au fur et à mesure de la migration des pages hors de Dexie.
import { getSupabase } from './supabase';
import { getTenantHost } from './tenant';

export const API_URL = import.meta.env.VITE_API_URL || 'https://api.azanga.tech';

// Toutes les boutiques partagent la même API (api.azanga.tech) — c'est cet en-tête qui
// indique au serveur quelle boutique est concernée (voir server/src/tenantResolver.js), en
// transmettant le nom d'hôte complet vu par le navigateur plutôt qu'un identifiant pré-découpé
// côté client : le serveur fait toute la résolution (sous-domaine aujourd'hui, domaine
// personnalisé plus tard), sans qu'aucun changement ne soit nécessaire ici à ce moment-là.
function tenantHeaders(): Record<string, string> {
  const host = getTenantHost();
  return host ? { 'X-Tenant-Host': host } : {};
}

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  let data: unknown = null;
  try {
    data = response.status === 204 ? null : await response.json();
  } catch {
    // Réponse non-JSON (ex: 502 d'un proxy) — on garde data à null.
  }

  if (!response.ok) {
    const message =
      (data && typeof data === 'object' && 'error' in data && typeof (data as any).error === 'string'
        ? (data as any).error
        : null) || `Erreur serveur (${response.status}).`;
    throw new ApiError(message, response.status);
  }

  return data as T;
}

// POST public (pas de jeton requis) — utilisé pour les endpoints appelés avant authentification
// (ex: validation de licence pendant l'activation d'une boutique).
export async function apiPostPublic<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...tenantHeaders() },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Impossible de joindre le serveur. Vérifie ta connexion internet.");
  }
  return handleResponse<T>(response);
}

// Jeton Supabase de la session courante — chaque appel authentifié en a besoin (voir
// server/src/auth.js, qui le vérifie via le JWKS public de Supabase).
async function getAccessToken(): Promise<string> {
  const supabase = await getSupabase();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError('Session expirée — reconnecte-toi.', 401);
  return token;
}

async function apiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await getAccessToken();
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...tenantHeaders(),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Impossible de joindre le serveur. Vérifie ta connexion internet.");
  }
  return handleResponse<T>(response);
}

export const apiGet = <T>(path: string) => apiRequest<T>('GET', path);
export const apiPost = <T>(path: string, body?: unknown) => apiRequest<T>('POST', path, body);
export const apiPut = <T>(path: string, body?: unknown) => apiRequest<T>('PUT', path, body);
export const apiDelete = (path: string) => apiRequest<void>('DELETE', path);
