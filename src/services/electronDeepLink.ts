// Écoute les liens ivente:// transmis par le processus principal Electron (voir
// electron/main.cjs + preload.cjs) — utile uniquement dans l'app desktop installée, où cliquer
// sur le lien de réinitialisation de mot de passe reçu par email doit ramener sur CETTE
// fenêtre plutôt que d'ouvrir un onglet de navigateur externe qui ne revient jamais vers l'app
// (voir supabaseAuth.ts, getRedirectUrl).
import { getSupabase } from './supabase';

// Le type de window.electronAPI est déclaré globalement dans src/vite-env.d.ts (partagé avec
// src/utils/electron.ts).
export function listenForElectronDeepLinks(): void {
  const api = window.electronAPI;
  if (!api?.isElectron || !api.onDeepLink) return;

  api.onDeepLink(async (url: string) => {
    try {
      const hashIndex = url.indexOf('#');
      const hash = hashIndex >= 0 ? url.slice(hashIndex + 1) : '';
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (!accessToken || !refreshToken) return;

      const supabase = await getSupabase();
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) {
        console.error('Échec de la session de réinitialisation reçue via le lien :', error.message);
        return;
      }

      // AuthGate.tsx et useAuth.tsx détectent déjà ce marqueur (isPasswordRecoveryLink) pour
      // afficher l'écran "nouveau mot de passe" et éviter une connexion automatique — même
      // mécanisme que le lien web, pour réutiliser exactement le même chemin déjà éprouvé.
      window.location.hash = 'type=recovery';
      window.location.reload();
    } catch (err) {
      console.error('Échec du traitement du lien de réinitialisation reçu :', err);
    }
  });
}
