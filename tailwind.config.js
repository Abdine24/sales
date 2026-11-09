/** @type {import('tailwindcss').Config} */

// Jeton de couleur défini en variable CSS (canaux RGB) dans src/index.css, pour que les
// thèmes Clair / Sombre / Contraste ne redéfinissent que des variables, et que l'opacité
// Tailwind (`bg-surface/80`) continue de fonctionner.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  future: {
    // Les variantes hover: ne s'appliquent qu'aux appareils qui savent survoler (souris,
    // trackpad). Sur téléphone, un survol ne reste plus « collé » après un toucher.
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      fontFamily: {
        // Police choisie par l'utilisateur (Arial, Microsoft Sans Serif ou Swiss 721 BT — voir
        // src/utils/appFont.ts et la variable --app-font de src/index.css), y compris pour les
        // codes/références affichés en font-mono.
        sans: ['var(--app-font)'],
        mono: ['var(--app-font)'],
      },
      colors: {
        canvas: token('canvas'),
        surface: token('surface'),
        'surface-muted': token('surface-muted'),
        line: token('line'),
        'line-strong': token('line-strong'),
        ink: token('ink'),
        'ink-muted': token('ink-muted'),
        accent: token('accent'),
        'accent-hover': token('accent-hover'),
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(15 23 42 / 0.05)',
      },
      transitionTimingFunction: {
        // Courbes partagées (exigence M3) : sortie franche pour les apparitions, courbe
        // « tiroir » pour les feuilles et panneaux.
        out: 'cubic-bezier(0.23, 1, 0.32, 1)',
        drawer: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
    },
  },
  plugins: [],
};
