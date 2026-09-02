import { useEffect, useState } from 'react';

// Remplace l'ancien useSync (file d'attente hors-ligne dans Dexie, devenue inutile : toutes
// les pages écrivent directement dans l'API maintenant). Ne garde que l'indicateur réseau,
// toujours utile pour l'utilisateur (voir aussi OnlineRequiredGate qui bloque l'app hors-ligne).
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

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

  return { isOnline };
}
