import React, { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { X } from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { EASE_DRAWER, EASE_OUT, shouldDismissSheet, useDialogBehavior } from './useDialogBehavior';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
}

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
  const dragControls = useDragControls();

  useDialogBehavior(isOpen, panelRef, onClose);

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

  // Rendue dans un portail sur <body>, jamais à l'endroit où elle est déclarée :
  // les pages vivent dans un <main class="space-y-4"> dont la marge collerait au
  // conteneur `fixed`, et un ancêtre avec transform/filter casserait `position: fixed`.
  const overlay = (
    <AnimatePresence>
      {isOpen && (
        // Mobile : feuille ancrée en bas (à portée du pouce), qui monte depuis le bord et se
        // ferme en la tirant vers le bas. Desktop : modale centrée, apparition courte.
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/50"
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.98 }}
            animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1 }}
            exit={
              isMobile
                ? { y: '100%', transition: { duration: 0.2, ease: EASE_DRAWER } }
                : { opacity: 0, scale: 0.98, transition: { duration: 0.15, ease: EASE_OUT } }
            }
            transition={isMobile ? { duration: 0.26, ease: EASE_DRAWER } : { duration: 0.2, ease: EASE_OUT }}
            drag={isMobile ? 'y' : false}
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.7 }}
            onDragEnd={(_, info) => {
              if (shouldDismissSheet(info.offset.y, info.velocity.y)) onClose();
            }}
            className={`relative w-full ${maxWidthClass} bg-surface border border-line rounded-t-xl sm:rounded-xl px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6 shadow-xl z-10 overflow-hidden focus:outline-none max-h-[92dvh] sm:max-h-none flex flex-col`}
          >
            {/* Poignée — mobile uniquement : on la tire vers le bas pour fermer. */}
            <div
              className="sm:hidden shrink-0 -mx-4 pt-1 pb-3 touch-none cursor-grab"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="sheet-grabber" />
            </div>

            <div
              className="flex items-center justify-between gap-2 pb-3 sm:pb-4 border-b border-line mb-4 sm:mb-5 shrink-0"
              onPointerDown={(e) => {
                if (isMobile && !(e.target as HTMLElement).closest('button')) dragControls.start(e);
              }}
            >
              <h3 id={titleId} className="text-lg font-semibold text-ink min-w-0 truncate">
                {title}
              </h3>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer"
                className="touch-target md:min-w-9 md:min-h-9 flex items-center justify-center shrink-0 rounded-lg text-ink-muted hover:text-ink hover:bg-slate-900/5 dark:hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Le contenu défile, pas la feuille entière : l'en-tête et sa croix restent
                atteignables en permanence. */}
            <div className="scroll-area flex-1 min-h-0 overflow-y-auto sm:max-h-[80vh] pr-1">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(overlay, document.body);
};
