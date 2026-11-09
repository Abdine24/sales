import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Store } from 'lucide-react';
import type { PersonnelRole, AppSettings, Licence } from '../../db/db';
import { canAccess } from '../../services/localAuth';
import { apiGet } from '../../services/api';
import { evaluateLicenceStatus } from '../../utils/license';
import { SIDEBAR_ORDER, type NavPage } from './navItems';

export type { NavPage } from './navItems';

interface SidebarProps {
  currentPage: NavPage;
  onNavigate: (page: NavPage) => void;
  role: PersonnelRole;
  collapsed: boolean;
  onToggle: () => void;
  /** Réglages de la boutique, chargés une seule fois par AppLayout. */
  settings: AppSettings | null;
  isOnline: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onNavigate,
  role,
  collapsed,
  onToggle,
  settings,
  isOnline,
}) => {
  const [licence, setLicence] = useState<Licence | null>(null);

  useEffect(() => {
    apiGet<Licence | null>('/licence').then(setLicence).catch(() => {});
  }, []);

  const licenceStatus = React.useMemo(() => evaluateLicenceStatus(licence), [licence]);
  const daysRemaining = licenceStatus.daysRemaining;
  const shopName = settings?.nom_site || 'iVente Pro';
  const licenceTone =
    daysRemaining <= 15
      ? 'text-rose-700 dark:text-rose-300'
      : daysRemaining <= 45
      ? 'text-amber-700 dark:text-amber-300'
      : 'text-ink-muted';

  return (
    <aside
      className={`${collapsed ? 'w-[72px]' : 'w-60'} relative h-full flex flex-col bg-surface border-r border-line p-3 shrink-0 select-none z-20`}
    >
      {/* Identité de la boutique */}
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2.5'} px-1.5 py-2 mb-4`}>
        {settings?.logo_url ? (
          <img
            src={settings.logo_url}
            alt=""
            className="w-9 h-9 rounded-lg object-cover shrink-0 border border-line bg-white"
          />
        ) : (
          <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center text-white shrink-0">
            <Store className="w-5 h-5" />
          </div>
        )}
        <div className={collapsed ? 'sr-only' : 'min-w-0 flex-1'}>
          {/* Deux lignes au maximum : le nom complet reste lisible sans être rogné au premier mot. */}
          <h1 className="font-semibold text-sm text-ink leading-tight line-clamp-2 break-words" title={shopName}>
            {shopName}
          </h1>
          <p className="text-xs text-ink-muted truncate mt-0.5" title={settings?.slogan || 'Commerce et caisse'}>
            {settings?.slogan || 'Commerce et caisse'}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggle}
        className="absolute -right-3 top-6 w-6 h-6 rounded-full bg-surface border border-line-strong shadow-xs flex items-center justify-center text-ink-muted hover:text-ink z-30"
        aria-label={collapsed ? 'Développer le menu' : 'Réduire le menu'}
        title={collapsed ? 'Développer le menu' : 'Réduire le menu'}
      >
        {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
      </button>

      {/* Navigation. Pas d'animation de la pastille active : on change de page des dizaines de
          fois par jour, l'état actif s'affiche instantanément. */}
      <nav aria-label="Navigation principale" className="flex-1 space-y-0.5">
        {SIDEBAR_ORDER.filter((item) => canAccess({ role }, item.id)).map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={collapsed ? item.label : undefined}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 ${collapsed ? 'justify-center px-2' : 'px-3'} h-10 rounded-lg text-sm transition-colors duration-150 ${
                isActive
                  ? 'bg-accent text-white font-medium'
                  : 'text-ink-muted hover:text-ink hover:bg-slate-900/5 dark:hover:bg-white/5'
              }`}
            >
              <Icon className="w-[18px] h-[18px] shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Abonnement et état réel de la connexion */}
      <div
        className={`${collapsed ? 'hidden' : 'flex'} mt-auto pt-3 border-t border-line px-1.5 text-xs text-ink-muted flex-col gap-1.5`}
      >
        <div className="flex items-center justify-between gap-2">
          <span>Abonnement</span>
          <span className={`font-medium ${licenceTone}`} title={`${daysRemaining} jour(s) restant(s)`}>
            {daysRemaining} j restants
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span>Connexion</span>
          <span
            className={`inline-flex items-center gap-1.5 font-medium ${
              isOnline ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            {isOnline ? 'En ligne' : 'Hors ligne'}
          </span>
        </div>
      </div>
    </aside>
  );
};
