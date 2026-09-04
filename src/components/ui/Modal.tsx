import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'md',
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const isMobile = useIsMobile();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Verrouille le scroll du body tant qu'une modale est ouverte
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  // Gestion clavier : Escape ferme, Tab est piégé dans la modale
  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Laisse le temps à Framer Motion de monter le noeud avant de déplacer le focus initialement
    const focusTimer = window.setTimeout(() => {
      // Ne vole pas le focus si l'utilisateur est déjà en train de saisir dans un champ
      if (!panelRef.current?.contains(document.activeElement)) {
        const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
        (first ?? panelRef.current)?.focus();
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusables = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  // Classes écrites en toutes lettres, jamais construites par concaténation :
  // Tailwind scanne le source en texte brut et ne génèrerait pas une classe
  // assemblée à l'exécution (`sm:${...}`). La largeur max ne s'applique qu'à
  // partir de `sm` — en dessous, la feuille occupe toute la largeur de l'écran.
  const maxWidthClass = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-md',
    lg: 'sm:max-w-lg',
    xl: 'sm:max-w-xl',
    '2xl': 'sm:max-w-2xl',
    '3xl': 'sm:max-w-4xl',
    '4xl': 'sm:max-w-5xl',
  }[maxWidth];

  // Rendue dans un portail sur <body>, jamais à l'endroit où elle est déclarée.
  // Les modales sont écrites au milieu du contenu des pages, or ce contenu vit
  // dans un <main class="space-y-4"> : la règle `space-y` de Tailwind cible tous
  // les enfants et collait donc une marge haute de 16px au conteneur `fixed` de
  // la modale, décalant la feuille vers le bas et faisant passer son bas sous
  // l'écran. Le portail met aussi la modale hors de portée de tout ancêtre qui
  // créerait un bloc conteneur (transform, filter, backdrop-filter...) et
  // casserait `position: fixed`.
  const overlay = (
    <AnimatePresence>
      {isOpen && (
        // Mobile : la feuille est ancrée en bas (items-end, pas de padding) pour
        // monter depuis le bord de l'écran comme dans une app native, et parce
        // que le haut de l'écran est hors de portée du pouce. Desktop : modale
        // centrée classique.
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            // Deux animations distinctes : glissement vertical depuis le bas sur
            // mobile (geste attendu pour une feuille), léger zoom sur desktop.
            initial={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.92, y: 20 }}
            animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
            exit={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.94, y: 15 }}
            transition={{ type: 'spring', damping: isMobile ? 32 : 25, stiffness: isMobile ? 380 : 350 }}
            className={`relative w-full ${maxWidthClass} glass-panel rounded-t-3xl sm:rounded-3xl px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6 shadow-2xl z-10 overflow-hidden border border-white/40 dark:border-white/10 focus:outline-none max-h-[92dvh] sm:max-h-none flex flex-col`}
          >
            {/* Poignée visuelle — mobile uniquement */}
            <div className="sheet-grabber mb-3 sm:hidden shrink-0" />

            {/* Header */}
            <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-slate-200/50 dark:border-white/10 mb-4 sm:mb-5 shrink-0">
              <h3
                id={titleId}
                className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight pr-2 min-w-0 truncate"
              >
                {title}
              </h3>
              <button
                onClick={onClose}
                aria-label="Fermer"
                className="touch-target flex items-center justify-center shrink-0 rounded-full hover:bg-slate-200/60 dark:hover:bg-slate-800/60 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-all tap-scale"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content — c'est lui qui scrolle, pas la feuille entière : l'en-tête
                et sa croix de fermeture restent atteignables en permanence. */}
            <div className="scroll-area flex-1 min-h-0 overflow-y-auto sm:max-h-[80vh] pr-1">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(overlay, document.body);
};
