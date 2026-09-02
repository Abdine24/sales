// Processus principal Electron — enveloppe desktop de l'app iVente Pro.
// Nécessite une connexion Internet (voir src/components/OnlineRequiredGate.tsx côté renderer) :
// l'UI est chargée localement (dist/), mais bloque son propre usage tant qu'il n'y a pas de réseau,
// en préparation de la bascule des données vers Supabase (mode "online-only").
const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');

// Une seule instance de l'app à la fois — évite deux caisses ouvertes sur la même base locale.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  let mainWindow = null;

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  const createWindow = () => {
    mainWindow = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 1024,
      minHeight: 640,
      backgroundColor: '#0f172a',
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    // Les liens externes (ex: un futur lien "Contacter le support") s'ouvrent dans le
    // navigateur par défaut plutôt que dans une nouvelle fenêtre Electron.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    const devServerUrl = process.env.ELECTRON_START_URL;
    if (devServerUrl) {
      mainWindow.loadURL(devServerUrl);
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
      mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    }
  };

  app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
