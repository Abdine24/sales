/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_REQUIRE_ONLINE?: string;
  // Base URL de l'API métier hébergée sur le VPS (ex: https://api.azanga.tech).
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Exposé par electron/preload.cjs uniquement quand l'app tourne dans l'exécutable Electron.
interface ElectronAPI {
  readonly isElectron: true;
  readonly platform: string;
}

interface Window {
  electronAPI?: ElectronAPI;
}
