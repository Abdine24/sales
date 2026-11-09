import React, { useEffect, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { PersonnelRole } from '../../db/db';
import { canAccess } from '../../services/localAuth';
import { Modal } from '../ui/Modal';
import { BOTTOM_NAV_ORDER, type NavPage } from './navItems';

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
 * Elle remplace la sidebar, inutilisable sur téléphone. Le pouce atteint naturellement le
 * bas de l'écran, d'où la barre en bas plutôt qu'un menu hamburger. Ordre par fréquence
 * d'usage (la caisse d'abord), pages non autorisées filtrées, surplus dans une feuille
 * « Plus » : jamais plus de 5 cibles côte à côte.
 */
export const BottomNav: React.FC<BottomNavProps> = ({ currentPage, onNavigate, role }) => {
  const [moreOpen, setMoreOpen] = useState(false);

  const allowed = BOTTOM_NAV_ORDER.filter((item) => canAccess({ role }, item.id));
  const needsMore = allowed.length > MAX_TABS + 1;
  const tabs = needsMore ? allowed.slice(0, MAX_TABS) : allowed;
  const overflow = needsMore ? allowed.slice(MAX_TABS) : [];

  // La page courante peut vivre dans « Plus » : l'onglet s'allume alors lui aussi, sinon
  // plus rien n'est actif à l'écran et l'utilisateur ne sait plus où il est.
  const currentInOverflow = overflow.some((item) => item.id === currentPage);

  // Referme la feuille dès qu'on change de page, y compris par un autre chemin.
  useEffect(() => {
    setMoreOpen(false);
  }, [currentPage]);

  const go = (page: NavPage) => {
    setMoreOpen(false);
    onNavigate(page);
  };

  const tabClass = (active: boolean) =>
    `tap-scale relative flex-1 min-w-0 flex flex-col items-center justify-center gap-1 py-1.5 min-h-[56px] ${
      active ? 'text-accent' : 'text-ink-muted'
    }`;

  // Repère de position au-dessus de l'onglet actif, affiché instantanément (pas d'animation :
  // la navigation est l'action la plus répétée de l'app).
  const indicator = <span aria-hidden className="absolute top-0 h-0.5 w-8 rounded-full bg-accent" />;

  return (
    <>
      <div className="md:hidden">
        <Modal isOpen={moreOpen} onClose={() => setMoreOpen(false)} title="Plus" maxWidth="sm">
          <div className="grid grid-cols-3 gap-2 pb-2">
            {overflow.map((item) => {
              const Icon = item.icon;
              const active = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => go(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`tap-scale flex flex-col items-center justify-center gap-2 rounded-xl px-2 py-4 border text-center ${
                    active
                      ? 'bg-accent text-white border-accent'
                      : 'bg-surface-muted border-line text-ink'
                  }`}
                >
                  <Icon className={`w-6 h-6 ${active ? 'text-white' : 'text-ink-muted'}`} />
                  <span className="text-xs font-medium leading-tight">{item.short}</span>
                </button>
              );
            })}
          </div>
        </Modal>
      </div>

      <nav
        aria-label="Navigation principale"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface border-t border-line safe-bottom"
      >
        <div className="flex items-stretch justify-around px-1">
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
                className={tabClass(active)}
              >
                {active && indicator}
                <Icon className="w-[22px] h-[22px]" />
                <span className={`text-xs leading-none truncate max-w-full ${active ? 'font-semibold' : 'font-medium'}`}>
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
              className={tabClass(currentInOverflow)}
            >
              {currentInOverflow && indicator}
              <MoreHorizontal className="w-[22px] h-[22px]" />
              <span className={`text-xs leading-none ${currentInOverflow ? 'font-semibold' : 'font-medium'}`}>Plus</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
};
