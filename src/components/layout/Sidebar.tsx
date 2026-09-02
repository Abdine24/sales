import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Users,
  Truck,
  RefreshCw,
  Store,
  FolderKanban,
  Building2,
  ChevronLeft,
  ChevronRight,
  Receipt,
} from 'lucide-react';
import { PersonnelRole } from '../../db/db';
import { canAccess } from '../../services/localAuth';
import { db } from '../../db/db';
import { evaluateLicenceStatus } from '../../utils/license';

export type NavPage = 'dashboard' | 'pos' | 'ventes' | 'stock' | 'clients' | 'fournisseurs' | 'categories' | 'personnel' | 'settings' | 'sync';

interface SidebarProps {
  currentPage: NavPage;
  onNavigate: (page: NavPage) => void;
  pendingCount: number;
  role: PersonnelRole;
  collapsed: boolean;
  onToggle: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onNavigate,
  pendingCount,
  role,
  collapsed,
  onToggle,
}) => {
  const settings = useLiveQuery(() => db.settings.get('principale'), []) || null;
  const licence = useLiveQuery(() => db.licence.get('principale'), []) || null;

  const licenceStatus = React.useMemo(() => evaluateLicenceStatus(licence), [licence]);
  const daysRemaining = licenceStatus.daysRemaining;
  const daysRemainingLabel = `${daysRemaining} left`;

  const menuItems = [
    { id: 'dashboard' as NavPage, label: 'Tableau de bord', icon: LayoutDashboard },
    { id: 'pos' as NavPage, label: 'Caisse (POS)', icon: ShoppingBag, badge: 'Caisse' },
    { id: 'ventes' as NavPage, label: 'Ventes & Retours', icon: Receipt },
    { id: 'stock' as NavPage, label: 'Stock & Produits', icon: Package },
    { id: 'clients' as NavPage, label: 'Clients & Créances', icon: Users },
    { id: 'fournisseurs' as NavPage, label: 'Fournisseurs', icon: Truck },
    { id: 'categories' as NavPage, label: 'Catégories & Variantes', icon: FolderKanban },
    { id: 'personnel' as NavPage, label: 'Gestion du personnel', icon: Users },
    { id: 'settings' as NavPage, label: 'Paramètres', icon: Building2 },
    {
      id: 'sync' as NavPage,
      label: 'Synchronisation',
      icon: RefreshCw,
      badge: pendingCount > 0 ? `${pendingCount}` : undefined,
    },
  ];

  return (
    <aside className={`${collapsed ? 'w-[76px]' : 'w-64'} relative h-screen flex flex-col glass-panel border-r border-slate-200/50 dark:border-white/10 p-3 shrink-0 select-none z-20 transition-[width] duration-200`}>
      {/* Brand Header */}
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2.5'} px-2 py-3 mb-4`}>
        {settings?.logo_url ? (
          <img
            src={settings.logo_url}
            alt={settings.nom_site || 'Logo'}
            className="w-10 h-10 rounded-2xl object-cover shadow-lg shadow-blue-500/20 shrink-0 border border-slate-200/50 dark:border-white/10 bg-white dark:bg-slate-900"
            title={`${settings?.nom_site || 'iVente Pro'} (${daysRemainingLabel})`}
          />
        ) : (
          <div
            className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-slate-900 via-blue-900 to-blue-600 dark:from-blue-600 dark:to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 shrink-0"
            title={`${settings?.nom_site || 'iVente Pro'} (${daysRemainingLabel})`}
          >
            <Store className="w-5 h-5 text-white" />
          </div>
        )}
        <div className={collapsed ? 'hidden' : 'min-w-0 flex-1'}>
          <div className="flex items-center justify-between gap-1.5 min-w-0">
            <h1
              className="font-bold text-base text-slate-900 dark:text-white tracking-tight leading-tight truncate"
              title={settings?.nom_site || 'iVente Pro'}
            >
              {settings?.nom_site || 'iVente Pro'}
            </h1>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border shrink-0 ${
                daysRemaining <= 15
                  ? 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/30'
                  : daysRemaining <= 45
                  ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30'
                  : 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
              }`}
              title={`Abonnement : ${daysRemaining} jour(s) restant(s)`}
            >
              {daysRemainingLabel}
            </span>
          </div>
          <p
            className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-40 mt-0.5"
            title={settings?.slogan || 'Commerce & Caisse'}
          >
            {settings?.slogan || 'Commerce & Caisse'}
          </p>
        </div>
      </div>

      <button
        onClick={onToggle}
        className="absolute -right-3 top-8 w-7 h-7 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 shadow-md flex items-center justify-center text-slate-600 dark:text-slate-200 z-30"
        title={collapsed ? 'Développer le menu' : 'Réduire le menu'}
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      {/* Navigation Links */}
      <nav className="flex-1 space-y-1.5">
        {menuItems.filter((item) => canAccess({ role }, item.id)).map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              title={collapsed ? item.label : undefined}
              className={`relative w-full flex items-center ${collapsed ? 'justify-center px-2' : 'justify-between px-3.5'} py-3 rounded-2xl font-medium text-sm transition-all duration-200 ${
                isActive
                  ? 'text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-slate-800/40'
              }`}
            >
              {/* Animated active background pill */}
              {isActive && (
                <motion.div
                  layoutId="activeNavBg"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  className="absolute inset-0 bg-blue-600 dark:bg-blue-500 rounded-2xl shadow-lg shadow-blue-600/30 -z-10"
                />
              )}

              <div className={`flex items-center ${collapsed ? '' : 'gap-3'}`}>
                <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
                <span className={collapsed ? 'hidden' : ''}>{item.label}</span>
              </div>

              {item.badge && !collapsed && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : item.id === 'sync' && pendingCount > 0
                      ? 'bg-amber-500 text-white animate-pulse'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer Info */}
      <div className={`${collapsed ? 'hidden' : 'flex'} mt-auto pt-3 border-t border-slate-200/50 dark:border-white/10 px-2 text-xs text-slate-500 dark:text-slate-400 flex-col gap-1.5`}>
        <div className="flex items-center justify-between">
          <span className="text-[11px]">Abonnement</span>
          <span className="font-bold text-slate-700 dark:text-slate-300 bg-slate-200/70 dark:bg-slate-800/80 px-1.5 py-0.5 rounded text-[10px] border border-slate-300/40 dark:border-white/5">
            {daysRemaining} jours restants
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px] opacity-75">
          <span>Base Locale</span>
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">Dexie.js</span>
        </div>
      </div>
    </aside>
  );
};
