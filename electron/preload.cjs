// Preload — s'exécute dans un contexte isolé avant le chargement de la page.
// N'expose que le strict nécessaire au renderer (pas d'accès Node direct : contextIsolation + sandbox actifs).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  // Transmet les liens ivente:// reçus par le processus principal (voir main.cjs) — utilisé
  // pour ramener automatiquement l'app dans cette fenêtre après un clic sur le lien de
  // réinitialisation de mot de passe reçu par email (voir
  // src/services/electronDeepLink.ts).
  onDeepLink: (callback) => {
    ipcRenderer.on('deep-link', (_event, url) => callback(url));
  },
  // Mise à jour automatique (voir electron/main.cjs) : le processus principal télécharge la
  // nouvelle version en arrière-plan puis prévient le renderer qu'elle est prête à installer.
  onUpdateReady: (callback) => {
    ipcRenderer.on('update-ready', (_event, info) => callback(info));
  },
  installUpdate: () => ipcRenderer.invoke('install-update'),
});
