import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Users,
  Truck,
  FolderKanban,
  Building2,
  Receipt,
  MoreHorizontal,
  X,
} from 'lucide-react';
import type { PersonnelRole } from '../../db/db';
import { canAccess } from '../../services/localAuth';
import type { NavPage } from './Sidebar';

interface NavItem {
  id: NavPage;
  label: string;
  /** Libellé court affiché sous l'icône dans la barre du bas (place très limitée). */
  short: string;
  icon: React.ComponentType<{ className?: string }>;
}

// Ordre volontairement différent de la sidebar : ici c'est la fréquence d'usage
// réelle en boutique qui prime, pas la hiérarchie logique du menu. La caisse
// passe donc devant tout le reste.
const NAV_ITEMS: NavItem[] = [
  { id: 'pos', label: 'Caisse (POS)', short: 'Caisse', icon: ShoppingBag },
  { id: 'ventes', label: 'Ventes & Retours', short: 'Ventes', icon: Receipt },
  { id: 'stock', label: 'Stock & Produits', short: 'Stock', icon: Package },
  { id: 'dashboard', label: 'Tableau de bord', short: 'Accueil', icon: LayoutDashboard },
  { id: 'clients', label: 'Clients & Créances', short: 'Clients', icon: Users },
  { id: 'fournisseurs', label: 'Fournisseurs', short: 'Fournis.', icon: Truck },
  { id: 'categories', label: 'Catégories & Variantes', short: 'Catégories', icon: FolderKanban },
  { id: 'personnel', label: 'Gestion du personnel', short: 'Personnel', icon: Users },
  { id: 'settings', label: 'Paramètres', short: 'Réglages', icon: Building2 },
];

/** Nombre d'onglets visibles avant de basculer le reste dans la feuille « Plus ». */
const MAX_TABS = 4;

interface BottomNavProps {
  currentPage: NavPage;
  onNavigate: (page: NavPage) => void;
  role: PersonnelRole;
}

/**
 * Barre d'onglets fixe en bas d'écran, visible uniquement sur mobile (`md:hidden`).
 *
 * Elle remplace la sidebar, inutilisable sur téléphone : 256px de large sur un
 * écran de 375px, c'est les deux tiers de la largeur pour du menu. Le pouce
 * atteint naturellement le bas de l'écran, pas le haut — d'où la barre en bas
 * plutôt qu'un menu hamburger.
 *
 * Les pages non autorisées pour le rôle sont filtrées comme dans la sidebar, et
 * le surplus part dans une feuille « Plus » : jamais plus de 5 cibles côte à
 * côte, sinon elles deviennent trop étroites pour être touchées sans erreur.
 */
export const BottomNav: React.FC<BottomNavProps> = ({ currentPage, onNavigate, role }) => {
  const [moreOpen, setMoreOpen] = useState(false);

  const allowed = NAV_ITEMS.filter((item) => canAccess({ role }, item.id));
  const needsMore = allowed.length > MAX_TABS + 1;
  const tabs = needsMore ? allowed.slice(0, MAX_TABS) : allowed;
  const overflow = needsMore ? allowed.slice(MAX_TABS) : [];

  // La page courante peut vivre dans « Plus » : l'onglet doit alors s'allumer
  // lui aussi, sinon plus rien n'est actif à l'écran et l'utilisateur ne sait
  // plus où il est.
  const currentInOverflow = overflow.some((item) => item.id === currentPage);

  // Referme la feuille dès qu'on change de page, y compris via un autre chemin
  // (bouton « Caisse » du header, redirection après une action...).
  useEffect(() => {
    setMoreOpen(false);
  }, [currentPage]);

  const go = (page: NavPage) => {
    setMoreOpen(false);
    onNavigate(page);
  };

  const sheet = (
    <AnimatePresence>
      {moreOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
          />
          <motion.div
            role="dialog"
            aria-label="Plus de pages"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 380 }}
            className="absolute inset-x-0 bottom-0 glass-panel rounded-t-3xl px-4 pt-3 safe-bottom shadow-2xl"
          >
            <div className="sheet-grabber mb-4" />
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">Plus</h3>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Fermer"
                className="touch-target flex items-center justify-center rounded-full text-slate-500 dark:text-slate-400 tap-scale"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 pb-4">
              {overflow.map((item) => {
                const Icon = item.icon;
                const active = currentPage === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => go(item.id)}
                    className={`tap-scale flex flex-col items-center justify-center gap-2 rounded-2xl px-2 py-4 border text-center ${
                      active
                        ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-600/25'
                        : 'bg-slate-50/80 dark:bg-slate-900/40 border-slate-200/70 dark:border-white/10 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Icon className={`w-6 h-6 ${active ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
                    <span className="text-[11px] font-bold leading-tight">{item.short}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {typeof document !== 'undefined' && createPortal(sheet, document.body)}

      <nav
        aria-label="Navigation principale"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 glass-panel border-t border-slate-200/60 dark:border-white/10 safe-bottom"
      >
        <div className="flex items-stretch justify-around px-1 pt-1.5">
          {tabs.map((item) => {
            const Icon = item.icon;
            const active = currentPage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id)}
                aria-current={active ? 'page' : undefined}
                aria-label={item.label}
                className="tap-scale relative flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] rounded-xl"
              >
                {/* Trait actif au-dessus de l'onglet — repère de position lisible
                    d'un coup d'œil, sans voler de place au libellé. */}
                {active && (
                  <motion.span
                    layoutId="bottomNavActive"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    className="absolute -top-1.5 h-1 w-8 rounded-full bg-blue-600 dark:bg-blue-500"
                  />
                )}
                <Icon
                  className={`w-[22px] h-[22px] ${
                    active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'
                  }`}
                />
                <span
                  className={`text-[10px] leading-none font-bold ${
                    active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {item.short}
                </span>
              </button>
            );
          })}

          {needsMore && (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-label="Plus de pages"
              aria-expanded={moreOpen}
              className="tap-scale relative flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] rounded-xl"
            >
              {currentInOverflow && (
                <span className="absolute -top-1.5 h-1 w-8 rounded-full bg-blue-600 dark:bg-blue-500" />
              )}
              <MoreHorizontal
                className={`w-[22px] h-[22px] ${
                  currentInOverflow ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'
                }`}
              />
              <span
                className={`text-[10px] leading-none font-bold ${
                  currentInOverflow ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                Plus
              </span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
};
