import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DialogProvider } from './components/ui/DialogProvider';
import { listenForElectronDeepLinks } from './services/electronDeepLink';

// N'a d'effet que dans l'app desktop installée (voir electronDeepLink.ts) — ne fait rien dans
// le navigateur.
listenForElectronDeepLinks();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <DialogProvider>
        <App />
      </DialogProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
