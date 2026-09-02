import React, { useCallback, useEffect, useState } from 'react';
import { Bell, KeyRound, Check } from 'lucide-react';
import { apiGet, apiPut } from '../services/api';

interface NotificationItem {
  id: number;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
}

const POLL_INTERVAL_MS = 30_000;

const iconFor = (type: string) => {
  if (type === 'password_reset_request') return KeyRound;
  return Bell;
};

export const NotificationBell: React.FC = () => {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);

  const reload = useCallback(async () => {
    try {
      setItems(await apiGet<NotificationItem[]>('/notifications'));
    } catch {
      // Silencieux — une cloche qui échoue à charger ne doit pas bloquer le reste de l'app.
    }
  }, []);

  useEffect(() => {
    reload();
    const id = window.setInterval(reload, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [reload]);

  const unreadCount = items.filter((item) => !item.read).length;

  const markRead = async (id: number) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)));
    try {
      await apiPut(`/notifications/${id}/lu`, {});
    } catch {
      reload();
    }
  };

  const markAllRead = async () => {
    setItems((prev) => prev.map((item) => ({ ...item, read: true })));
    try {
      await apiPut('/notifications/lu-tout', {});
    } catch {
      reload();
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative p-2 rounded-xl glass-card text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Zone invisible pour fermer le menu au clic extérieur */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto glass-panel rounded-2xl border border-slate-200/60 dark:border-white/10 shadow-xl z-40">
            <div className="p-3 border-b border-slate-200/50 dark:border-white/10 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Notifications</span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  <Check className="w-3 h-3" /> Tout marquer lu
                </button>
              )}
            </div>
            {items.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">Aucune notification.</div>
            ) : (
              <div className="divide-y divide-slate-200/40 dark:divide-white/5">
                {items.map((item) => {
                  const Icon = iconFor(item.type);
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => markRead(item.id)}
                      className={`w-full text-left p-3 flex items-start gap-2.5 transition-colors ${
                        item.read
                          ? 'opacity-60 hover:opacity-100'
                          : 'bg-blue-500/5 hover:bg-blue-500/10'
                      }`}
                    >
                      <div className={`p-1.5 rounded-lg shrink-0 ${item.read ? 'bg-slate-200 dark:bg-slate-700 text-slate-500' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-slate-700 dark:text-slate-200 leading-snug">{item.message}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {new Date(item.created_at).toLocaleString('fr-FR', {
                            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
