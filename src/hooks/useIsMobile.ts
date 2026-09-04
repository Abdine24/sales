import { useEffect, useState } from 'react';

/**
 * Vrai tant que la fenêtre est plus étroite que `maxWidth`.
 *
 * Sert aux cas où le CSS ne suffit pas : une classe Tailwind peut cacher un
 * élément selon la largeur, mais pas changer une animation JavaScript ou la
 * valeur d'une prop. Le seuil par défaut (639px) correspond exactement à la
 * limite du préfixe `sm:` de Tailwind, pour que les bascules CSS et JS se
 * produisent au même pixel — sinon une modale peut s'animer comme une feuille
 * tout en étant stylée comme une modale centrée.
 */
export function useIsMobile(maxWidth = 639): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(`(max-width: ${maxWidth}px)`).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    // Resynchronise à l'abonnement : la largeur a pu changer entre le premier
    // rendu et cet effet (rotation de l'écran, ouverture du clavier virtuel).
    setIsMobile(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [maxWidth]);

  return isMobile;
}
