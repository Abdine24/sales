import React, { useEffect, useState } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { isOnlineRequired } from '../utils/electron';

// Bloque l'usage de l'app tant qu'il n'y a pas de connexion Internet — actif partout
// (navigateur, PWA, Electron). L'app est online-only : les données vivent sur l'API du VPS,
// plus dans Dexie/IndexedDB local, donc rien ne peut fonctionner hors-ligne de toute façon.
export const OnlineRequiredGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOnlineRequired() || isOnline) return <>{children}</>;

  const retry = () => {
    setChecking(true);
    setIsOnline(navigator.onLine);
    window.setTimeout(() => setChecking(false), 600);
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-sm glass-card p-8 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-white/10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 mx-auto mb-5">
          <WifiOff className="w-7 h-7" />
        </div>
        <h1 className="text-lg font-black tracking-tight text-slate-900 dark:text-white">
          Connexion Internet requise
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 mb-6">
          Cette application a besoin d'Internet pour fonctionner. Vérifie ta connexion Wi-Fi ou ta 4G, puis réessaie.
        </p>
        <button
          onClick={retry}
          disabled={checking}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
          Réessayer
        </button>
      </div>
    </div>
  );
};
