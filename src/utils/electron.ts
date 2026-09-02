// Détecte si l'app tourne dans l'exécutable Electron (voir electron/preload.cjs)
// plutôt que dans un navigateur / la PWA installée.
export const isElectron = (): boolean =>
  typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron);

// L'app est online-only partout (navigateur, PWA, Electron) : les données vivent sur le VPS,
// plus dans Dexie/IndexedDB local. Toujours vrai désormais — la fonction reste pour garder un
// seul point d'appel dans le code (OnlineRequiredGate) plutôt que de coder "true" en dur.
export const isOnlineRequired = (): boolean => true;
