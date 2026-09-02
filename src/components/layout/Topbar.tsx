import React, { useState, useEffect } from 'react';
import {
  Wifi,
  WifiOff,
  Sun,
  Moon,
  Leaf,
  Contrast,
  PlusCircle,
  Database,
  UserCircle,
  LogOut,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { NotificationBell } from '../NotificationBell';
import { Zone } from '../../db/db';

export type ThemeMode = 'light' | 'dark' | 'emerald' | 'contrast';

interface TopbarProps {
  isOnline: boolean;
  onQuickSale: () => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
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
  onQuickSale,
  themeMode,
  setThemeMode,
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
        {/* Network Status — l'app est online-only, ce badge reflète juste l'état de connexion. */}
        <div className="flex items-center">
          {isOnline ? (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-bold"
              title="Connexion active · En ligne"
            >
              <Wifi className="w-4 h-4 text-emerald-500" />
              <span className="text-[11px] font-bold">En ligne</span>
            </div>
          ) : (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-xs font-bold"
              title="Connexion perdue — l'app a besoin d'internet pour fonctionner."
            >
              <WifiOff className="w-4 h-4 text-rose-500 animate-pulse" />
              <span className="text-[11px] font-bold">Hors ligne</span>
            </div>
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

        <NotificationBell />

        <div className="flex items-center gap-2 border-l border-slate-200/50 dark:border-white/10 pl-4">
          <UserCircle className="w-7 h-7 text-blue-500" />
          <div className="hidden sm:block max-w-36">
            <div className="text-xs font-bold text-slate-900 dark:text-white truncate">@{userLabel}</div>
            {userEmail && (
              <div className="text-[10px] text-slate-400 capitalize truncate">{userEmail}</div>
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

        {/* Theme Selector (Clair, Sombre, Vert Émeraude, Orange Sunset) */}
        <div className="flex items-center p-1 rounded-xl glass-card border border-slate-200/60 dark:border-white/10 gap-0.5" title="Thème d'affichage">
          <button
            type="button"
            onClick={() => setThemeMode('light')}
            className={`p-1.5 rounded-lg transition-all ${
              themeMode === 'light'
                ? 'bg-white text-amber-500 shadow-xs font-bold'
                : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
            title="Mode Clair (Light Glass)"
          >
            <Sun className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setThemeMode('dark')}
            className={`p-1.5 rounded-lg transition-all ${
              themeMode === 'dark'
                ? 'bg-slate-800 text-blue-400 shadow-xs font-bold'
                : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
            title="Mode Sombre (Dark Slate)"
          >
            <Moon className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setThemeMode('emerald')}
            className={`p-1.5 rounded-lg transition-all ${
              themeMode === 'emerald'
                ? 'bg-emerald-950 text-emerald-400 shadow-xs font-bold border border-emerald-500/40'
                : 'text-slate-400 hover:text-emerald-500'
            }`}
            title="Mode Vert Émeraude (Forêt & Jade Luxe)"
          >
            <Leaf className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setThemeMode('contrast')}
            className={`p-1.5 rounded-lg transition-all ${
              themeMode === 'contrast'
                ? 'bg-slate-900 text-white shadow-xs font-bold ring-2 ring-blue-500'
                : 'text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Mode Clair Haute Visibilité (Sans Glass / Opacité 100% & Bordures Prononcées)"
          >
            <Contrast className="w-3.5 h-3.5" />
          </button>
        </div>

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
