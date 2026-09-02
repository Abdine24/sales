import { useState, useEffect, useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, SyncItem } from '../db/db';
import { getSupabase, isSupabaseConfigured } from '../services/supabase';

// Nombre d'échecs avant de placer un élément en statut « echec » (retrait de la file active)
const MAX_ATTEMPTS = 5;
// Back-off exponentiel : 5s, 10s, 20s, 40s, 80s
const BASE_RETRY_DELAY_MS = 5_000;
// Tentative périodique tant qu'il reste des éléments en attente
const POLL_INTERVAL_MS = 30_000;

async function sendToSupabase(item: SyncItem): Promise<void> {
  const supabase = await getSupabase();
  const payload = JSON.parse(item.data);
  let error = null;

  if (item.action === 'INSERT') {
    ({ error } = await supabase.from(item.table).insert(payload));
  } else if (item.action === 'UPDATE') {
    ({ error } = await supabase.from(item.table).update(payload).eq('id', payload.id));
  } else if (item.action === 'DELETE') {
    ({ error } = await supabase.from(item.table).delete().eq('id', payload.id));
  }

  if (error) throw new Error(error.message);
}

export function useSync() {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const syncingRef = useRef(false);

  const pendingItems = useLiveQuery(
    () => db.file_attente_sync.where('status').equals('en_attente').toArray(),
    []
  );
  const failedItems = useLiveQuery(
    () => db.file_attente_sync.where('status').equals('echec').toArray(),
    []
  );

  const pendingCount = pendingItems?.length ?? 0;
  const failedCount = failedItems?.length ?? 0;

  const triggerSync = useCallback(async () => {
    if (!navigator.onLine || syncingRef.current) return;

    const now = Date.now();
    const queue = (await db.file_attente_sync.where('status').equals('en_attente').toArray())
      .filter((item) => !item.next_retry_at || new Date(item.next_retry_at).getTime() <= now);

    if (queue.length === 0) {
      setLastSyncTime(new Date());
      return;
    }

    syncingRef.current = true;
    setIsSyncing(true);
    const configured = isSupabaseConfigured();

    try {
      for (const item of queue) {
        if (!item.id) continue;

        // Mode démo : pas de backend réel, on considère l'élément traité
        if (!configured) {
          await db.file_attente_sync.update(item.id, { status: 'synchronise' });
          continue;
        }

        try {
          await sendToSupabase(item);
          await db.file_attente_sync.update(item.id, {
            status: 'synchronise',
            last_error: undefined,
            next_retry_at: undefined,
          });
        } catch (err) {
          const attempts = (item.attempts ?? 0) + 1;
          const message = err instanceof Error ? err.message : 'Erreur de synchronisation inconnue';

          if (attempts >= MAX_ATTEMPTS) {
            // On garde l'élément (aucune perte de donnée) mais on le sort de la file active
            await db.file_attente_sync.update(item.id, { status: 'echec', attempts, last_error: message });
            console.error(`Sync abandonnée pour ${item.table}#${item.id} après ${attempts} tentatives :`, message);
          } else {
            const delay = BASE_RETRY_DELAY_MS * 2 ** (attempts - 1);
            await db.file_attente_sync.update(item.id, {
              attempts,
              last_error: message,
              next_retry_at: new Date(Date.now() + delay).toISOString(),
            });
            console.warn(`Sync échouée pour ${item.table}#${item.id} (tentative ${attempts}), nouvel essai dans ${delay / 1000}s`);
          }
        }
      }
      setLastSyncTime(new Date());
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  }, []);

  // Remet les éléments en échec dans la file active
  const retryFailed = useCallback(async () => {
    await db.file_attente_sync
      .where('status')
      .equals('echec')
      .modify({ status: 'en_attente', attempts: 0, next_retry_at: undefined });
    triggerSync();
  }, [triggerSync]);

  // Écoute l'état réseau
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      triggerSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [triggerSync]);

  // Déclenche quand des éléments arrivent dans la file
  useEffect(() => {
    if (isOnline && pendingCount > 0) triggerSync();
  }, [isOnline, pendingCount, triggerSync]);

  // Réessai périodique (couvre le back-off et les coupures réseau silencieuses)
  useEffect(() => {
    if (!isOnline) return;
    const id = window.setInterval(() => {
      if (pendingCount > 0) triggerSync();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [isOnline, pendingCount, triggerSync]);

  return {
    isOnline,
    pendingCount,
    failedCount,
    isSyncing,
    lastSyncTime,
    triggerSync,
    retryFailed,
  };
}

// Ajoute une action à la file de synchronisation
export async function pushToSyncQueue(
  action: 'INSERT' | 'UPDATE' | 'DELETE',
  table: string,
  data: unknown
) {
  const syncItem: SyncItem = {
    action,
    table,
    data: JSON.stringify(data),
    date_creation: new Date().toISOString(),
    status: 'en_attente',
    attempts: 0,
  };
  await db.file_attente_sync.add(syncItem);
}
