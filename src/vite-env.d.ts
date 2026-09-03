/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_REQUIRE_ONLINE?: string;
  // Base URL de l'API métier hébergée sur le VPS (ex: https://api.azanga.tech).
  readonly VITE_API_URL?: string;
  // Domaine racine multi-tenant — chaque boutique vit sur <slug>.VITE_ROOT_DOMAIN (voir
  // src/services/tenant.ts).
  readonly VITE_ROOT_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Exposé par electron/preload.cjs uniquement quand l'app tourne dans l'exécutable Electron.
interface ElectronAPI {
  readonly isElectron: true;
  readonly platform: string;
  // Transmet les liens ivente:// reçus par le processus principal (voir main.cjs) — utilisé
  // pour le retour automatique dans l'app après un clic sur le lien de réinitialisation de
  // mot de passe reçu par email (voir src/services/electronDeepLink.ts).
  onDeepLink?: (callback: (url: string) => void) => void;
}

interface Window {
  electronAPI?: ElectronAPI;
}
