// Processus principal Electron — enveloppe desktop de l'app iVente Pro.
// Nécessite une connexion Internet (voir src/components/OnlineRequiredGate.tsx côté renderer) :
// l'UI est chargée localement (dist/), mais bloque son propre usage tant qu'il n'y a pas de réseau,
// en préparation de la bascule des données vers Supabase (mode "online-only").
const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('node:path');
const { autoUpdater } = require('electron-updater');

// Schéma d'URL personnalisé pour ramener l'utilisateur dans CETTE fenêtre installée après un
// clic sur le lien de réinitialisation de mot de passe reçu par email, au lieu d'ouvrir un
// onglet de navigateur externe qui ne revient jamais vers l'app (voir
// src/services/supabaseAuth.ts, getRedirectUrl : en Electron, le lien envoyé à Supabase pointe
// vers "ivente://reset-password" plutôt qu'une URL https — à ajouter aux "Redirect URLs"
// autorisées dans le Dashboard Supabase pour que Supabase accepte d'y rediriger).
const PROTOCOL = 'ivente';

if (process.defaultApp) {
  // Lancé via `electron .` (dev) plutôt qu'en tant qu'exécutable installé : Windows a besoin
  // du chemin complet vers le script pour ré-invoquer correctement l'app au clic sur le lien.
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

// Trouve le premier argument de ligne de commande qui est un lien ivente:// — sur
// Windows/Linux, cliquer sur un tel lien relance l'app avec ce lien en argument (capté soit au
// tout premier lancement via process.argv, soit via l'évènement "second-instance" si l'app
// tournait déjà).
const extractDeepLink = (argv) => argv.find((arg) => arg.startsWith(`${PROTOCOL}://`)) || null;

// Une seule instance de l'app à la fois — évite deux caisses ouvertes sur la même base locale.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  let mainWindow = null;
  // Lien reçu avant que la fenêtre n'existe encore (premier lancement déclenché par le lien).
  let pendingDeepLink = extractDeepLink(process.argv);

  const sendDeepLink = (url) => {
    if (!url || !mainWindow) return;
    if (mainWindow.webContents.isLoading()) {
      mainWindow.webContents.once('did-finish-load', () => mainWindow.webContents.send('deep-link', url));
    } else {
      mainWindow.webContents.send('deep-link', url);
    }
  };

  app.on('second-instance', (_event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    const url = extractDeepLink(commandLine);
    if (url) sendDeepLink(url);
  });

  // macOS reçoit le lien via cet évènement dédié plutôt que dans les arguments de commande.
  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (mainWindow) {
      sendDeepLink(url);
    } else {
      pendingDeepLink = url;
    }
  });

  // Mise à jour automatique — vérifie et télécharge en arrière-plan une nouvelle version
  // publiée sur notre propre VPS (voir package.json > build.publish, procédure de publication
  // dans server/deploy/README-app-updates.md). On NE l'installe PAS automatiquement dès le
  // téléchargement terminé : le renderer affiche un bouton (à côté de la Licence, voir
  // src/components/LicenceSection.tsx) pour laisser l'utilisateur choisir le moment du
  // redémarrage — une caisse ne doit pas se relancer toute seule en plein encaissement.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow) mainWindow.webContents.send('update-ready', { version: info?.version || null });
  });
  autoUpdater.on('error', (err) => {
    console.error('[auto-update]', err && err.stack ? err.stack : err);
  });

  ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall();
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

    if (pendingDeepLink) {
      sendDeepLink(pendingDeepLink);
      pendingDeepLink = null;
    }
  };

  app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    // app.isPackaged est faux en dev (npm run electron / electron:dev) : pas de latest.yml
    // local dans ce cas, checkForUpdates planterait pour rien.
    if (app.isPackaged) {
      const checkForUpdates = () => {
        autoUpdater.checkForUpdates().catch((err) => console.error('[auto-update] check failed', err));
      };
      setTimeout(checkForUpdates, 10_000); // laisse l'app finir de démarrer avant de solliciter le réseau
      setInterval(checkForUpdates, 4 * 60 * 60 * 1000); // re-vérifie toutes les 4h (app souvent laissée ouverte toute la journée à la caisse)
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
