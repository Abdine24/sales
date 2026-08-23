import React, { useState, useEffect } from 'react';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Sun,
  Moon,
  PlusCircle,
  Database,
  UserCircle,
  LogOut,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Zone } from '../../db/db';

interface TopbarProps {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  triggerSync: () => void;
  onQuickSale: () => void;
  darkMode: boolean;
  setDarkMode: (val: boolean | ((prev: boolean) => boolean)) => void;
  userLabel: string;
  userEmail?: string;
  onLogout: () => void;
  zones: Zone[];
  activeZoneId: number | null;
  onZoneChange: (zoneId: number | null) => void;
  canSelectAll: boolean;
}

export const Topbar: React.FC<TopbarProps> = ({
  isOnline,
  pendingCount,
  isSyncing,
  triggerSync,
  onQuickSale,
  darkMode,
  setDarkMode,
  userLabel,
  userEmail,
  onLogout,
  zones,
  activeZoneId,
  onZoneChange,
  canSelectAll,
}) => {
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      );
      setCurrentDate(
        now.toLocaleDateString('fr-FR', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        })
      );
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="h-16 glass-panel border-b border-slate-200/50 dark:border-white/10 px-6 flex items-center justify-between sticky top-0 z-10">
      <div className="flex-1" />

      {/* Right Controls */}
      <div className="flex items-center gap-3 min-w-0 overflow-x-auto">
        {/* Network & Sync Badge (Apple style) */}
        <div className="flex items-center gap-2">
          {isSyncing ? (
            <Badge variant="blue" className="animate-pulse">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-500" />
              <span>Synchro en cours...</span>
            </Badge>
          ) : isOnline ? (
            <button
              onClick={triggerSync}
              title="Cliquez pour forcer la synchronisation avec la base distante"
            >
              <Badge variant={pendingCount > 0 ? 'amber' : 'green'} dot>
                <Wifi className="w-3.5 h-3.5" />
                <span>
                  {pendingCount > 0
                    ? `${pendingCount} action(s) en attente`
                    : 'En ligne (IndexedDB Synced)'}
                </span>
              </Badge>
            </button>
          ) : (
            <Badge variant="amber" dot>
              <WifiOff className="w-3.5 h-3.5" />
              <span>Mode Hors-Ligne ({pendingCount} attente)</span>
            </Badge>
          )}
        </div>

        {/* Quick New Sale button */}
        <Button variant="primary" size="sm" icon={<PlusCircle className="w-4 h-4" />} onClick={onQuickSale}>
          Caisse
        </Button>

        <select
          value={activeZoneId ?? ''}
          disabled={!canSelectAll}
          onChange={(event) => onZoneChange(event.target.value ? Number(event.target.value) : null)}
          className="glass-input px-2.5 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 max-w-40"
          title={canSelectAll ? 'Filtrer par magasin' : 'Zone affectée au gérant'}
        >
          {canSelectAll && <option value="">Tous les magasins</option>}
          {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.nom}</option>)}
        </select>

        <div className="flex items-center gap-2 border-l border-slate-200/50 dark:border-white/10 pl-4">
          <UserCircle className="w-7 h-7 text-blue-500" />
          <div className="hidden xl:block max-w-40">
            <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{userLabel}</div>
            {userEmail && userEmail !== userLabel && (
              <div className="text-[10px] text-slate-400 truncate">{userEmail}</div>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon={<LogOut className="w-4 h-4" />}
            onClick={onLogout}
            title="Se déconnecter"
          >
            Déconnexion
          </Button>
        </div>

        {/* Dark Mode Toggle */}
        <button
          onClick={() => setDarkMode((prev) => !prev)}
          className="p-2.5 rounded-xl glass-card text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all"
          title="Basculer le mode sombre/clair"
        >
          {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
        </button>

        {/* Time & Date Display */}
        <div className="text-right border-l border-slate-200/50 dark:border-white/10 pl-4 text-slate-600 dark:text-slate-300">
          <div className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
            {currentTime}
          </div>
          <div className="text-[11px] capitalize text-slate-400">{currentDate}</div>
        </div>
      </div>
    </header>
  );
};
