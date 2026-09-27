// Police d'affichage choisie par l'utilisateur (sélecteur dans la barre du haut, voir
// Topbar.tsx). Mémorisée par appareil (localStorage), comme le thème.
//
// Aucune de ces polices n'est embarquée dans le site : Arial, Microsoft Sans Serif et Swiss 721
// BT sont sous licence propriétaire et non redistribuables. On utilise celle qui est installée
// sur l'appareil ; si elle ne l'est pas, la pile retombe sur Arial (ou son équivalent : Liberation
// Sans / Arimo sur Linux, Roboto sur Android).
//
// La police est appliquée via la variable CSS --app-font, utilisée par font-sans et font-mono
// (voir tailwind.config.js) et par les impressions (index.css, utils/barcode.ts).

export type AppFontId = 'arial' | 'mssans' | 'swiss';

const ARIAL_STACK = 'Arial, "Liberation Sans", Arimo, Roboto, Helvetica, sans-serif';

// families : noms sous lesquels la police peut être installée (utilisés dans la pile CSS et pour
// détecter sa présence sur l'appareil).
export const APP_FONTS: { id: AppFontId; label: string; families: string[]; stack: string }[] = [
  { id: 'arial', label: 'Arial', families: ['Arial'], stack: ARIAL_STACK },
  {
    id: 'mssans',
    label: 'Microsoft Sans Serif',
    families: ['Microsoft Sans Serif'],
    stack: `"Microsoft Sans Serif", ${ARIAL_STACK}`,
  },
  {
    id: 'swiss',
    label: 'Swiss 721 BT',
    // Bitstream installe la famille sous le nom « Swis721 BT » ; d'autres éditions utilisent
    // « Swiss 721 BT » ou « Swiss721 BT ».
    families: ['Swis721 BT', 'Swiss 721 BT', 'Swiss721 BT'],
    stack: `"Swis721 BT", "Swiss 721 BT", "Swiss721 BT", ${ARIAL_STACK}`,
  },
];

const STORAGE_KEY = 'app-font';

export function getAppFont(): AppFontId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (APP_FONTS.some((f) => f.id === saved)) return saved as AppFontId;
  } catch {
    // localStorage indisponible (navigation privée...) : police par défaut
  }
  return 'arial';
}

export function applyAppFont(id: AppFontId): void {
  const font = APP_FONTS.find((f) => f.id === id) ?? APP_FONTS[0];
  document.documentElement.style.setProperty('--app-font', font.stack);
  try {
    localStorage.setItem(STORAGE_KEY, font.id);
  } catch {
    // choix non mémorisé, mais appliqué pour la session
  }
}

// Pile de la police actuellement choisie — pour les documents séparés (iframe d'impression) qui
// n'héritent pas de la variable CSS de la page.
export function currentFontStack(): string {
  return (APP_FONTS.find((f) => f.id === getAppFont()) ?? APP_FONTS[0]).stack;
}

// Vrai si la police est installée sur l'appareil : on compare la largeur d'un texte rendu avec
// cette police (puis une police générique en secours) à celle de la police générique seule.
// Si la police manque, le navigateur utilise le secours et les largeurs sont identiques.
export function isFontInstalled(family: string): boolean {
  if (typeof document === 'undefined') return false;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  const sample = 'mmmmmmmmmmlli1WQ@#';
  return ['monospace', 'serif'].some((generic) => {
    ctx.font = `72px ${generic}`;
    const base = ctx.measureText(sample).width;
    ctx.font = `72px "${family}", ${generic}`;
    return ctx.measureText(sample).width !== base;
  });
}
