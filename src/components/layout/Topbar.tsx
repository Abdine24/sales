import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wifi,
  WifiOff,
  Sun,
  Moon,
  Leaf,
  Contrast,
  PlusCircle,
  UserCircle,
  LogOut,
  Store,
  X,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { NotificationBell } from '../NotificationBell';
import { Zone, AppSettings } from '../../db/db';

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
  settings?: AppSettings | null;
}

const THEMES: { mode: ThemeMode; icon: React.ComponentType<{ className?: string }>; label: string; activeClass: string }[] = [
  { mode: 'light', icon: Sun, label: 'Clair', activeClass: 'bg-white text-amber-500 shadow-xs' },
  { mode: 'dark', icon: Moon, label: 'Sombre', activeClass: 'bg-slate-800 text-blue-400 shadow-xs' },
  { mode: 'emerald', icon: Leaf, label: 'Émeraude', activeClass: 'bg-emerald-950 text-emerald-400 border border-emerald-500/40' },
  { mode: 'contrast', icon: Contrast, label: 'Contraste', activeClass: 'bg-slate-900 text-white ring-2 ring-blue-500' },
];

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
  settings,
}) => {
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
      setCurrentDate(
        now.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
      );
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  const onlineBadge = (
    <div
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold ${
        isOnline
          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
      }`}
      title={isOnline ? 'Connexion active · En ligne' : "Connexion perdue — l'app a besoin d'internet."}
    >
      {isOnline ? (
        <Wifi className="w-4 h-4 text-emerald-500" />
      ) : (
        <WifiOff className="w-4 h-4 text-rose-500 animate-pulse" />
      )}
      <span className="text-[11px] font-bold">{isOnline ? 'En ligne' : 'Hors ligne'}</span>
    </div>
  );

  const zoneSelect = (className: string) => (
    <select
      value={activeZoneId ?? ''}
      disabled={!canSelectAll}
      onChange={(event) => onZoneChange(event.target.value ? Number(event.target.value) : null)}
      className={className}
      title={canSelectAll ? 'Filtrer par magasin' : 'Zone affectée au gérant'}
    >
      {canSelectAll && <option value="">Tous les magasins</option>}
      {zones.map((zone) => (
        <option key={zone.id} value={zone.id}>
          {zone.nom}
        </option>
      ))}
    </select>
  );

  const themeSwitcher = (size: 'sm' | 'lg') => (
    <div
      className={`flex items-center rounded-xl glass-card border border-slate-200/60 dark:border-white/10 ${
        size === 'lg' ? 'p-1.5 gap-1 w-full' : 'p-1 gap-0.5'
      }`}
      title="Thème d'affichage"
    >
      {THEMES.map(({ mode, icon: Icon, label, activeClass }) => (
        <button
          key={mode}
          type="button"
          onClick={() => setThemeMode(mode)}
          aria-label={`Thème ${label}`}
          aria-pressed={themeMode === mode}
          className={`tap-scale rounded-lg transition-all ${
            size === 'lg' ? 'flex-1 flex flex-col items-center gap-1 py-2.5' : 'p-1.5'
          } ${
            themeMode === mode
              ? `${activeClass} font-bold`
              : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <Icon className={size === 'lg' ? 'w-5 h-5' : 'w-3.5 h-3.5'} />
          {size === 'lg' && <span className="text-[10px] font-bold">{label}</span>}
        </button>
      ))}
    </div>
  );

  // Feuille « compte » — sur mobile, tout ce qui n'est pas consulté en
  // permanence (zone, thème, identité, déconnexion) descend ici plutôt que de
  // s'entasser dans un header qui déborderait en scroll horizontal.
  const accountSheet = (
    <AnimatePresence>
      {accountOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setAccountOpen(false)}
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
          />
          <motion.div
            role="dialog"
            aria-label="Compte et réglages rapides"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 380 }}
            className="absolute inset-x-0 bottom-0 glass-panel rounded-t-3xl px-4 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl max-h-[85dvh] overflow-y-auto scroll-area"
          >
            <div className="sheet-grabber mb-4" />

            <div className="flex items-center gap-3 mb-5">
              <UserCircle className="w-11 h-11 text-blue-500 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-bold text-slate-900 dark:text-white truncate">@{userLabel}</div>
                {userEmail && (
                  <div className="text-xs text-slate-400 capitalize truncate">{userEmail}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setAccountOpen(false)}
                aria-label="Fermer"
                className="touch-target flex items-center justify-center rounded-full text-slate-500 dark:text-slate-400 tap-scale"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center justify-between mb-5">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Connexion</span>
              {onlineBadge}
            </div>

            <div className="mb-5">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 block">
                Magasin
              </label>
              {zoneSelect(
                'glass-input w-full px-3 py-3 rounded-xl font-semibold text-slate-700 dark:text-slate-200'
              )}
            </div>

            <div className="mb-6">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 block">
                Thème
              </label>
              {themeSwitcher('lg')}
            </div>

            <Button
              variant="ghost"
              className="w-full justify-center"
              icon={<LogOut className="w-4 h-4" />}
              onClick={onLogout}
            >
              Se déconnecter
            </Button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {typeof document !== 'undefined' && createPortal(accountSheet, document.body)}

      <header className="glass-panel border-b border-slate-200/50 dark:border-white/10 sticky top-0 z-30 safe-top">
        {/* --- Header mobile : identité à gauche, actions essentielles à droite.
            Rien d'autre : le reste vit dans la feuille « compte ». --- */}
        <div className="md:hidden h-14 px-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {settings?.logo_url ? (
              <img
                src={settings.logo_url}
                alt=""
                className="w-8 h-8 rounded-xl object-cover shrink-0 border border-slate-200/50 dark:border-white/10 bg-white dark:bg-slate-900"
              />
            ) : (
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-slate-900 via-blue-900 to-blue-600 dark:from-blue-600 dark:to-indigo-500 flex items-center justify-center shrink-0">
                <Store className="w-4 h-4 text-white" />
              </div>
            )}
            <div className="min-w-0">
              <div className="font-bold text-sm text-slate-900 dark:text-white truncate leading-tight">
                {settings?.nom_site || 'iVente Pro'}
              </div>
              <div className="text-[10px] text-slate-400 leading-tight truncate">
                {isOnline ? currentTime : 'Hors ligne'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            {!isOnline && (
              <span className="touch-target flex items-center justify-center" title="Hors ligne">
                <WifiOff className="w-5 h-5 text-rose-500 animate-pulse" />
              </span>
            )}
            <NotificationBell />
            <button
              type="button"
              onClick={() => setAccountOpen(true)}
              aria-label="Compte et réglages"
              className="touch-target flex items-center justify-center rounded-full tap-scale"
            >
              <UserCircle className="w-7 h-7 text-blue-500" />
            </button>
          </div>
        </div>

        {/* --- Header desktop : inchangé. --- */}
        <div className="hidden md:flex h-16 px-6 items-center justify-between">
          <div className="flex-1" />

          <div className="flex items-center gap-3 min-w-0">
            {onlineBadge}

            <Button variant="primary" size="sm" icon={<PlusCircle className="w-4 h-4" />} onClick={onQuickSale}>
              Caisse
            </Button>

            {zoneSelect(
              'glass-input px-2.5 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 max-w-40'
            )}

            <NotificationBell />

            <div className="flex items-center gap-2 border-l border-slate-200/50 dark:border-white/10 pl-4">
              <UserCircle className="w-7 h-7 text-blue-500" />
              <div className="max-w-36">
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

            {themeSwitcher('sm')}

            <div className="text-right border-l border-slate-200/50 dark:border-white/10 pl-4 text-slate-600 dark:text-slate-300">
              <div className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
                {currentTime}
              </div>
              <div className="text-[11px] capitalize text-slate-400">{currentDate}</div>
            </div>
          </div>
        </div>
      </header>
    </>
  );
};
