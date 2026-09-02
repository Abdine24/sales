// Détecte si l'app tourne dans l'exécutable Electron (voir electron/preload.cjs)
// plutôt que dans un navigateur / la PWA installée.
export const isElectron = (): boolean =>
  typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron);

// Force le garde "connexion requise" même en navigateur — utile pour tester le mode
// online-only sans construire l'exécutable Electron (VITE_REQUIRE_ONLINE=true dans .env).
export const isOnlineRequired = (): boolean =>
  isElectron() || import.meta.env.VITE_REQUIRE_ONLINE === 'true';
