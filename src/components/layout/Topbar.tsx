import React, { useEffect, useRef, useState } from 'react';
import { Wifi, WifiOff, Sun, Moon, Contrast, ShoppingBag, UserCircle, LogOut, Store, ChevronDown } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { NotificationBell } from '../NotificationBell';
import { Zone, AppSettings } from '../../db/db';

export type ThemeMode = 'light' | 'dark' | 'contrast';

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

const THEMES: { mode: ThemeMode; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { mode: 'light', icon: Sun, label: 'Clair' },
  { mode: 'dark', icon: Moon, label: 'Sombre' },
  { mode: 'contrast', icon: Contrast, label: 'Contraste' },
];

/** Heure courante, mise à jour à chaque changement de minute (et non chaque seconde). */
function useMinuteClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: number;
    const schedule = () => {
      const msToNextMinute = 60_000 - (Date.now() % 60_000);
      timer = window.setTimeout(() => {
        setNow(new Date());
        schedule();
      }, msToNextMinute + 50);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, []);
  return now;
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
  settings,
}) => {
  const now = useMinuteClock();
  const currentTime = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const currentDate = now.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const shopName = settings?.nom_site || 'iVente Pro';

  // Menu compte (desktop) : se ferme au clic extérieur et à Échap.
  useEffect(() => {
    if (!accountMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!accountMenuRef.current?.contains(e.target as Node)) setAccountMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAccountMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [accountMenuOpen]);

  // État de la connexion : icône seule. Le libellé reste disponible au survol et pour les
  // lecteurs d'écran. Pas de pulsation : un état se lit, il ne clignote pas.
  const connectionIcon = (
    <span
      className="flex items-center justify-center"
      title={isOnline ? 'En ligne' : "Hors ligne — l'app a besoin d'internet."}
      role="img"
      aria-label={isOnline ? 'En ligne' : 'Hors ligne'}
    >
      {isOnline ? <Wifi className="w-5 h-5 text-emerald-600" /> : <WifiOff className="w-5 h-5 text-rose-600" />}
    </span>
  );

  const zoneSelect = (className: string) => (
    <select
      value={activeZoneId ?? ''}
      disabled={!canSelectAll}
      onChange={(event) => onZoneChange(event.target.value ? Number(event.target.value) : null)}
      className={className}
      aria-label="Magasin"
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

  const themeSwitcher = (
    <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-surface-muted border border-line" role="group" aria-label="Thème d'affichage">
      {THEMES.map(({ mode, icon: Icon, label }) => {
        const active = themeMode === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => setThemeMode(mode)}
            aria-pressed={active}
            className={`flex flex-col items-center gap-1 py-2 rounded-md text-xs transition-colors ${
              active ? 'bg-surface text-ink font-medium shadow-xs border border-line' : 'text-ink-muted hover:text-ink border border-transparent'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        );
      })}
    </div>
  );

  const identity = (
    <div className="flex items-center gap-3 min-w-0">
      <UserCircle className="w-9 h-9 text-ink-muted shrink-0" />
      <div className="min-w-0">
        <div className="text-sm font-semibold text-ink truncate">@{userLabel}</div>
        {userEmail && <div className="text-xs text-ink-muted capitalize truncate">{userEmail}</div>}
      </div>
    </div>
  );

  return (
    <>
      {/* Feuille « compte » (mobile) : tout ce qui n'est pas consulté en permanence (magasin,
          thème, identité, déconnexion) descend ici plutôt que de s'entasser dans le header. */}
      <Modal isOpen={accountSheetOpen} onClose={() => setAccountSheetOpen(false)} title="Compte" maxWidth="sm">
        <div className="space-y-5 pb-1">
          {identity}
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink-muted">Connexion</span>
            <span className="flex items-center gap-2 text-sm font-medium text-ink">
              {connectionIcon}
              {isOnline ? 'En ligne' : 'Hors ligne'}
            </span>
          </div>
          <div>
            <label className="text-sm font-medium text-ink mb-1.5 block">Magasin</label>
            {zoneSelect('glass-input w-full px-3 py-3 rounded-lg')}
          </div>
          <div>
            <span className="text-sm font-medium text-ink mb-1.5 block">Thème</span>
            {themeSwitcher}
          </div>
          <Button variant="secondary" className="w-full" icon={<LogOut className="w-4 h-4" />} onClick={onLogout}>
            Se déconnecter
          </Button>
        </div>
      </Modal>

      <header className="bg-surface border-b border-line sticky top-0 z-30 safe-top">
        {/* --- Mobile : identité à gauche, actions essentielles à droite. --- */}
        <div className="md:hidden h-14 px-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {settings?.logo_url ? (
              <img src={settings.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0 border border-line bg-white" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
                <Store className="w-4 h-4 text-white" />
              </div>
            )}
            <div className="min-w-0">
              <div className="font-semibold text-sm text-ink truncate leading-tight">{shopName}</div>
              <div className="text-xs text-ink-muted leading-tight truncate">{isOnline ? currentTime : 'Hors ligne'}</div>
            </div>
          </div>

          <div className="flex items-center shrink-0">
            <span className="touch-target flex items-center justify-center">{connectionIcon}</span>
            <NotificationBell />
            <button
              type="button"
              onClick={() => setAccountSheetOpen(true)}
              aria-label="Compte et réglages"
              className="touch-target flex items-center justify-center rounded-lg tap-scale text-ink-muted"
            >
              <UserCircle className="w-7 h-7" />
            </button>
          </div>
        </div>

        {/* --- Desktop : magasin et caisse à gauche ; état, notifications, compte à droite. --- */}
        <div className="hidden md:flex h-14 px-6 items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {zoneSelect('glass-input h-9 px-2.5 rounded-lg text-sm font-medium max-w-56 disabled:opacity-100')}
            <Button variant="primary" size="sm" icon={<ShoppingBag className="w-4 h-4" />} onClick={onQuickSale}>
              Nouvelle vente
            </Button>
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <div className="text-right pr-2 hidden lg:block">
              <div className="text-sm font-semibold text-ink leading-tight">{currentTime}</div>
              <div className="text-xs capitalize text-ink-muted leading-tight">{currentDate}</div>
            </div>

            <span className="w-9 h-9 flex items-center justify-center">{connectionIcon}</span>
            <NotificationBell />

            <div className="relative" ref={accountMenuRef}>
              <button
                type="button"
                onClick={() => setAccountMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
                className="flex items-center gap-2 h-9 pl-1.5 pr-2 rounded-lg hover:bg-slate-900/5 dark:hover:bg-white/10 transition-colors max-w-56"
              >
                <UserCircle className="w-6 h-6 text-ink-muted shrink-0" />
                <span className="text-sm font-medium text-ink truncate">@{userLabel}</span>
                <ChevronDown className="w-4 h-4 text-ink-muted shrink-0" />
              </button>

              {accountMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-2 w-72 origin-top-right rounded-xl bg-surface border border-line shadow-lg p-3 space-y-3 z-40"
                >
                  {identity}
                  <div>
                    <span className="text-xs font-medium text-ink-muted mb-1.5 block">Thème</span>
                    {themeSwitcher}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    icon={<LogOut className="w-4 h-4" />}
                    onClick={onLogout}
                    role="menuitem"
                  >
                    Se déconnecter
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
    </>
  );
};
