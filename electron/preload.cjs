// Preload — s'exécute dans un contexte isolé avant le chargement de la page.
// N'expose que le strict nécessaire au renderer (pas d'accès Node direct : contextIsolation + sandbox actifs).
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
});
