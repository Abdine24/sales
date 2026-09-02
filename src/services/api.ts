// Client minimal pour l'API métier hébergée sur le VPS. Point d'entrée unique qui sera
// réutilisé au fur et à mesure de la migration des pages hors de Dexie.

export const API_URL = import.meta.env.VITE_API_URL || 'https://api.azanga.tech';

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

// POST public (pas de jeton requis) — utilisé pour les endpoints appelés avant authentification
// (ex: validation de licence pendant l'activation d'une boutique).
export async function apiPostPublic<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Impossible de joindre le serveur. Vérifie ta connexion internet.");
  }

  let data: unknown = null;
  try {
    data = await response.json();
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
