import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Comportement commun à toutes les fenêtres superposées (modale, feuille mobile, panneau
 * latéral) : défilement de la page bloqué, Échap ferme, Tab reste piégé dans la fenêtre, le
 * focus va au premier élément à l'ouverture et revient à son point de départ à la fermeture.
 */
export function useDialogBehavior(
  isOpen: boolean,
  panelRef: React.RefObject<HTMLElement | null>,
  onClose: () => void
) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Laisse le temps au panneau d'être monté avant d'y déplacer le focus.
    const focusTimer = window.setTimeout(() => {
      // Ne vole pas le focus si l'utilisateur est déjà en train de saisir dans un champ.
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
  }, [isOpen, panelRef]);
}

/** Une feuille se ferme si on la tire de plus de 96 px, ou d'un geste vif (vitesse > 500 px/s). */
export const shouldDismissSheet = (offsetY: number, velocityY: number) => offsetY > 96 || velocityY > 500;

/** Courbes partagées (exigence M3), au format framer-motion. */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const EASE_DRAWER = [0.32, 0.72, 0, 1] as const;
