// Client pour l'espace propriétaire (voir server/src/routes/plateforme.js, pages/OwnerConsole.tsx).
// Authentification totalement séparée de Supabase : un jeton de session propre, stocké sous une
// clé localStorage dédiée pour ne jamais se mélanger avec la session d'un compte boutique.
import { API_URL, ApiError } from './api';

const TOKEN_KEY = 'ivente_owner_token';

export const getOwnerToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

const setOwnerToken = (token: string | null) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Stockage indisponible (navigation privée...) — la session ne survivra pas à un
    // rechargement, mais la page reste utilisable pour la session en cours.
  }
};

async function handle<T>(response: Response): Promise<T> {
  let data: unknown = null;
  try {
    data = response.status === 204 ? null : await response.json();
  } catch {
    // ignore
  }
  if (!response.ok) {
    if (response.status === 401) setOwnerToken(null);
    const message =
      (data && typeof data === 'object' && 'error' in data && typeof (data as any).error === 'string'
        ? (data as any).error
        : null) || `Erreur serveur (${response.status}).`;
    throw new ApiError(message, response.status);
  }
  return data as T;
}

export async function ownerLogin(password: string): Promise<void> {
  const response = await fetch(`${API_URL}/plateforme/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const { token } = await handle<{ token: string }>(response);
  setOwnerToken(token);
}

export const ownerLogout = () => setOwnerToken(null);

async function ownerRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getOwnerToken();
  if (!token) throw new ApiError('Non connecté.', 401);
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handle<T>(response);
}

export const ownerGet = <T>(path: string) => ownerRequest<T>('GET', path);
export const ownerPut = <T>(path: string, body?: unknown) => ownerRequest<T>('PUT', path, body);
export const ownerPost = <T>(path: string, body?: unknown) => ownerRequest<T>('POST', path, body);
