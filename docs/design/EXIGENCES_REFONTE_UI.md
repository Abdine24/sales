# iVente Pro : exigences de design UI pour la refonte

Revue faite le 9 novembre 2026 sur le front `src/` (React 19, Vite, Tailwind 3, framer-motion).

## 0. Contexte de la revue

| Point | Détail |
| --- | --- |
| Outil utilisé | Le pack de skills design installé le 7 novembre 2026 (`C:\Users\user\.claude\skills`). Grille principale : **emil-design-eng** (finition UI, composants, animations). Grilles complémentaires du même pack : **break-ui** (données extrêmes), **mobile-native** (sensation d'app sur téléphone), **apple-design** (retours, sobriété). Le plugin Figma n'a pas servi : il n'est pas autorisé dans Claude (`/mcp`). |
| Méthode | Lecture du code et comptage des motifs dans tous les fichiers `.tsx` et `index.css`. L'app n'a pas été lancée dans un navigateur, car elle demande une connexion et l'API. Les constats viennent du code et n'ont pas été vérifiés à l'écran. |
| Design actuel figé | Tag Git **`design-v1-avant-refonte`**, posé sur `main` (commit `dabeacd`) et poussé sur GitHub (Abdine24/sales). Pour revoir l'ancien design : `git checkout design-v1-avant-refonte`. |
| Document existant | `Bureau\SUGGESTIONS_AMELIORATION_DESIGN_SAAS.txt` traite déjà le « look IA » : verre dépoli, dégradés, Sparkles, confettis, arrondis. La revue confirme ces constats dans le code. Ce document les intègre et ajoute ce qui manquait : accessibilité, focus clavier, contrastes, cibles tactiles, cas limites, cohérence et système de design. |

## 1. L'UI actuelle en chiffres

| Motif (fichiers `.tsx`) | Nombre | Lecture |
| --- | --- | --- |
| Classes `glass-card` / `glass-panel` / `glass-input` | 207 | Le verre dépoli sert de surface par défaut partout. |
| `text-slate-400` (gris clair sur fond clair) | 377 | Contraste d'environ 2,5:1 sur blanc. Le minimum AA est 4,5:1. |
| Textes `text-[9px]` à `text-[11px]` | 209 | Trop petits pour une caisse (écran à distance, néons, soleil). |
| `font-bold` / `font-black` | 381 / 69 | Presque tout est en gras, donc plus aucune hiérarchie. |
| `uppercase` + `tracking-wider/widest` | 68 / 49 | Petites étiquettes en capitales espacées, peu lisibles. |
| Violet / indigo / rose (`purple`, `indigo`, `pink`…) | 153 (dont 83 dans `Stock.tsx`) | Une 2ᵉ couleur d'accent sans rôle clair. |
| Bleu `blue-500/600` | 308 | Accent principal, écrit en dur plutôt qu'en jeton. |
| Arrondis `rounded-xl` / `2xl` / `3xl` / `lg-md` | 276 / 97 / 10 / 94 | Quatre rayons différents sans règle d'usage. |
| `transition-all` | 61 | Anime toutes les propriétés, y compris la mise en page. |
| `<button>` brut / `<Button>` du design system | 165 / 123 | Plus de boutons écrits à la main que de boutons du composant. |
| `focus-visible` | **0** | Aucun anneau de focus clavier dédié. `Button` supprime même le contour. |
| `aria-live` / `role="status"` | **0** | Les toasts ne sont pas annoncés aux lecteurs d'écran. |
| `prefers-reduced-motion` / `useReducedMotion` | **0** | Aucun respect du réglage « réduire les animations ». |
| Survol réservé à la souris `(hover: hover)` | **0** | Les effets de survol se déclenchent au toucher sur mobile. |
| Couleurs `apple.*` de `tailwind.config.js` | 0 utilisation | Palette déclarée, jamais utilisée : du code mort. |

## 2. Exigences de design pour la refonte

Chaque exigence est vérifiable. Le « Pourquoi » vient des grilles du pack de skills.

### 2.1 Fondations (jetons)

| N° | Exigence | Pourquoi |
| --- | --- | --- |
| F1 | Définir les couleurs en **jetons sémantiques** (variables CSS + `tailwind.config.js`) : `surface`, `surface-raised`, `border`, `text`, `text-muted`, `accent`, `success`, `warning`, `danger`. Aucune couleur Tailwind brute (`blue-600`, `purple-500`…) dans les pages. | Un seul endroit à changer. Les thèmes ne s'appuient plus sur des `!important` (`index.css:298-373`). |
| F2 | **Un seul accent** (le bleu). Le violet ne sert qu'à un sens métier précis (par exemple « produit à variantes »), avec un jeton dédié, ou il disparaît. | 153 usages de violet, indigo et rose aujourd'hui, et des dégradés bleu-violet qui « font template IA ». |
| F3 | **Surfaces pleines** : fond d'app gris très clair, cartes blanches avec bordure 1 px et ombre fine neutre. Aucun `backdrop-filter` sauf sur les barres collantes (header, barre du bas), et jamais plus de 12 px de flou. | Lisibilité en boutique. Le flou coûte cher sur les petits Android et sous Safari. |
| F4 | **Échelle typographique fixe de 5 tailles** : 12 / 14 / 16 / 20 / 24 px (et 30 px pour les montants clés). Rien sous 12 px, sauf mentions légales et impression. | 209 textes à 9-11 px aujourd'hui. |
| F5 | **Trois graisses** au maximum : 400 (texte), 500 (libellés, boutons), 600 (titres, montants). `font-black` est interdit. | Le gras ne hiérarchise plus quand tout est en gras. |
| F6 | **Chiffres tabulaires** (`tabular-nums`) sur tous les montants FCFA, quantités, dates, références et colonnes de tableau. | Les montants s'alignent en colonne et ne « dansent » plus quand ils changent (horloge, totaux). |
| F7 | **Contraste AA** : 4,5:1 pour le texte, 3:1 pour les icônes et bordures utiles. Le texte secondaire passe au minimum à `slate-500` sur blanc (`slate-600` de préférence). En sombre, au minimum `slate-400` sur `slate-900`. | 377 `text-slate-400` sur fond clair, à environ 2,5:1. |
| F8 | **Deux rayons** : 8 px (boutons, champs, badges, puces) et 12 px (cartes, modales, feuilles). `rounded-full` est réservé aux avatars et pastilles. Pas de `rounded-3xl`. | Quatre rayons coexistent sans règle. |
| F9 | **Grille d'espacement en multiples de 4 px**, avec des paddings de carte constants (16 px mobile, 20-24 px desktop). | Les cartes du tableau de bord mélangent `p-4 sm:p-5`, `p-3.5`, `p-6`… |
| F10 | **Thèmes réduits à 3** : Clair, Sombre, Contraste élevé. Le thème « Émeraude » disparaît (`Topbar.tsx:41`, `index.css:297-332`). Chaque thème ne redéfinit que des jetons. | Moins de combinaisons à tester, plus de surcharges `!important`. |
| F11 | **Iconographie** : une icône = un sens. Pas de `Sparkles` ni d'émoji (⚡ ✨ 🎉 ⚠️ 📅 ✅ 💡) dans l'interface métier. Les émojis restent permis dans les messages WhatsApp envoyés aux clients. | 14 `Sparkles` et des émojis dans les boutons, titres et `<option>`. |

### 2.2 Composants

| N° | Exigence | Pourquoi |
| --- | --- | --- |
| C1 | Tous les boutons passent par `<Button>`, y compris les boutons-icônes (variante `icon` avec `aria-label` obligatoire). | 165 `<button>` bruts ont chacun leur propre style. |
| C2 | Chaque élément cliquable a 4 états visibles : repos, survol (souris uniquement), **focus clavier** (`focus-visible:ring-2 ring-accent ring-offset-2`), pressé (`scale(0.97)`, 100-160 ms). | `Button.tsx:22` supprime le contour sans le remplacer. |
| C3 | Cible tactile d'au moins **44 × 44 px** sur mobile pour tous les boutons, même si l'icône fait 16 px. | Les boutons +/− du panier font environ 22 px (`POS.tsx:880-891`). |
| C4 | Une seule **feuille / modale** générique (portail, focus piégé, `Escape`, `aria-modal`, titre lié). `Drawer`, la feuille « Compte » et la feuille « Plus » la réutilisent. | `Modal.tsx` fait déjà bien. `Drawer.tsx` et les feuilles de `Topbar` et `BottomNav` refont chacune la même chose avec moins de garanties. |
| C5 | **Toasts** : zone `aria-live="polite"`, en bas au centre sur mobile (au-dessus de la barre d'onglets) et en haut à droite sur desktop, minuteur en pause au survol et quand l'onglet est masqué, bouton fermer de 44 px. Bibliothèque recommandée : **Sonner**, couverte par le skill `ask-sonner` du même pack. | `DialogProvider.tsx:105-127` : aucune annonce, minuteur fixe de 4 s, croix de 14 px. |
| C6 | **Badges** : rectangle à 8 px d'arrondi, sans flou, teintes pleines claires (`emerald-50` / `emerald-700`…). | `Badge.tsx:46` : `rounded-full backdrop-blur-sm`. |
| C7 | **Cartes** : `<div>` simple, sans animation d'entrée. L'effet de survol est réservé aux cartes cliquables, et se limite à une bordure plus foncée, sans soulèvement. | `GlassCard.tsx:18-22` fait sauter chaque carte au rendu. `hoverEffect` est posé sur des cartes non cliquables (`Dashboard.tsx:653-773`, `Fournisseurs.tsx:152`). |
| C8 | **Popovers** (sélecteur de dates, notifications) : ils s'ouvrent depuis leur déclencheur (`transform-origin` du côté du bouton), avec une largeur bornée par l'écran (`max-w-[calc(100vw-24px)]`). | `DateRangePicker.tsx:299-305` : largeur fixe de 340 px, origine au centre. |
| C9 | **Tableaux** : en-tête collant, chiffres alignés à droite en tabulaire, ligne de 44 px minimum. Sur mobile, ils deviennent une liste de cartes ; pas de défilement horizontal sur les écrans de caisse. | 10 tableaux, dont `Stock.tsx:3056` en `min-w-[700px]`. |
| C10 | États **vide / chargement / erreur** standardisés : squelettes plutôt qu'un « Chargement… », un message vide avec une action. | Aucun squelette aujourd'hui (`POS.tsx:640`). |

### 2.3 Mouvement (grille emil-design-eng)

| N° | Exigence | Pourquoi |
| --- | --- | --- |
| M1 | Rien n'est animé quand l'action est répétée des dizaines de fois par jour : ajout au panier, filtres, onglets, saisie au clavier ou à la douchette. | En caisse, chaque animation ralentit la vente. |
| M2 | Durées : pression 100-160 ms, menus et popovers 150-250 ms, modales et feuilles 200-300 ms. Rien au-delà de 300 ms. | La modale desktop utilise un ressort avec `scale: 0.92` (`Modal.tsx:133-136`), trop ample. |
| M3 | Courbes personnalisées partagées en jetons : `--ease-out: cubic-bezier(0.23,1,0.32,1)`, `--ease-drawer: cubic-bezier(0.32,0.72,0,1)`. Pas de `ease-in`. | Un seul vocabulaire de mouvement. |
| M4 | Animer uniquement `transform` et `opacity`. `transition-all` est interdit (61 usages). | Les autres propriétés recalculent la mise en page à chaque image. |
| M5 | Respect de `prefers-reduced-motion` : on garde les fondus et on supprime les déplacements (via `MotionConfig reducedMotion="user"`). | 0 prise en charge aujourd'hui. |
| M6 | Survols conditionnés à `@media (hover: hover) and (pointer: fine)`. | Sur téléphone, un survol « collé » reste affiché après le toucher. |
| M7 | Pas de confettis ni de pulsation permanente. Une vente réussie s'affiche en confirmation comptable nette : total, monnaie rendue, actions d'impression et WhatsApp. | `POS.tsx:600` (confettis), `Topbar.tsx:88` (Wi-Fi qui pulse). |

### 2.4 Mobile (grille mobile-native)

Les fondations sont déjà bonnes et doivent être conservées (`index.css:37-194`) : suppression du flash au toucher, `touch-action: manipulation`, champs à 16 px contre le zoom iOS, `100dvh`, zones de sécurité (encoches), barre d'onglets du bas, feuilles qui montent du bas.

| N° | Exigence | Pourquoi |
| --- | --- | --- |
| N1 | Plus de `h-screen` ni de `100vh` : utiliser `100dvh` ou la hauteur du parent. | `Sidebar.tsx:67` et `POS.tsx:648` utilisent encore `100vh`. |
| N2 | Panier de caisse sur mobile : bouton « Panier (n) · total » collant au-dessus de la barre d'onglets, qui ouvre une feuille. Ne pas obliger à faire défiler toute la grille de produits. | La caisse est l'écran le plus utilisé sur téléphone. |
| N3 | Feuilles : glisser vers le bas pour fermer (vitesse > 0,11 px/ms), pas seulement la croix. | Une poignée est affichée, mais le geste qu'elle suggère ne fonctionne pas. |
| N4 | Tester sur un vrai téléphone Android d'entrée de gamme, qui correspond au parc des clients. | Le flou et les ombres lourdes y coûtent le plus. |

### 2.5 Données et cas limites (grille break-ui)

| N° | Exigence | Pourquoi |
| --- | --- | --- |
| D1 | Les montants s'adaptent : `1 234 567 890 FCFA` doit tenir dans une carte de 160 px (taille de police réduite ou abréviation `1,23 Md`, avec le montant complet en info-bulle). Jamais rogné sans signe. | `Dashboard.tsx:663, 689, 706, 731` : `whitespace-nowrap` dans une carte en `overflow-hidden`, donc les gros montants sont coupés sans aucun signal. |
| D2 | Noms longs (produit, client, boutique) : 2 lignes au maximum puis `…`, nom complet au survol ou à l'appui long. Tester avec un nom de 60 caractères sans espace. | Beaucoup de `truncate` sur une seule ligne. Le nom de la boutique est coupé dans la sidebar. |
| D3 | Chaque liste se teste à 0, à 1 et à 500 éléments, et chaque compteur à 0 et à 9 999 (pastille panier, notifications). | La pastille panier `text-[9px]` ne passe pas à 3 chiffres (`ProductCard.tsx:242`). |
| D4 | Tous les textes de l'interface sont en français. | « 12 left » dans la sidebar (`Sidebar.tsx:52`). |
| D5 | Les états affichés reflètent la réalité. | « Données : En ligne » est écrit en dur, même hors ligne (`Sidebar.tsx:180`). |

## 3. Constats classés par priorité

**P0** bloque l'usage ou l'accessibilité. **P1** dégrade fortement l'image ou l'efficacité. **P2** relève de la finition et de la dette.

### P0 : à corriger dans la refonte quoi qu'il arrive

| Avant | Après | Pourquoi |
| --- | --- | --- |
| `Button.tsx:22` `focus:outline-none` sans remplacement | `focus-visible:ring-2 ring-accent ring-offset-2` | Un utilisateur au clavier (ou à la douchette + Tab) ne voit plus où il est. |
| 377 `text-slate-400` sur fond clair | Jeton `text-muted` ≥ 4,5:1 (`slate-600`) | Le texte secondaire est illisible sous les néons ou en plein soleil. |
| 209 textes de 9-11 px (`Stock.tsx` 50, `Dashboard.tsx` 34, `AuthGate.tsx` 19) | 12 px minimum | Lisibilité à distance d'un écran de caisse. |
| Boutons +/− du panier `p-1` + icône 14 px (`POS.tsx:880-891`) | Cible de 44 px, ou un champ quantité éditable | Erreurs de quantité au doigt en pleine vente. |
| Montants rognés (`Dashboard.tsx:663-731`) | Police qui s'adapte ou abréviation + info-bulle | Le chiffre d'affaires peut s'afficher faux sans qu'on le voie. |
| Toasts sans `aria-live` (`DialogProvider.tsx:105`) | Zone `aria-live="polite"` (ou Sonner) | Les confirmations ne sont pas annoncées aux lecteurs d'écran. |
| `Drawer.tsx:33-66` : ni `role="dialog"`, ni focus piégé, ni portail, croix sans `aria-label` | Réutiliser le socle de `Modal` | Le focus s'échappe derrière le panneau. |

### P1 : image professionnelle et vitesse perçue

| Avant | Après | Pourquoi |
| --- | --- | --- |
| `.glass-panel` / `.glass-card` en verre dépoli à 16-20 px (`index.css:240-295`) | Surfaces pleines + bordure 1 px | Lisibilité, performances, sérieux. |
| `GlassCard.tsx:18-21` : entrée `y: 15` + survol `y: -4, scale: 1.01` | `<div>` sans animation, bordure au survol si cliquable | Les cartes sautent à chaque filtre ; un survol sur une carte non cliquable promet une action qui n'existe pas. |
| `Button.tsx:47-48` : `whileHover scale 1.02`, `whileTap 0.95` | CSS `active:scale-[0.97]` en 120 ms, pas de grossissement | Un bouton métier ne grossit pas. CSS plutôt que JS, qui reste fluide même quand l'app est occupée. |
| `ProductCard.tsx:138` : survol `scale 1.015, y -2` | Bordure accent au survol (souris seulement) | La grille de caisse « bouge » sous la souris. |
| `POS.tsx:3, 600` : confettis à chaque vente | Confirmation nette : total, monnaie rendue, actions | Des dizaines de ventes par jour : la fête devient du bruit. |
| `POS.tsx:856-861` : chaque ligne du panier glisse (`x: 20`) | Apparition instantanée, ou fondu de 120 ms au maximum | Action très fréquente (M1). |
| Dégradés bleu → violet (`POS.tsx:1024, 1511`, `Dashboard.tsx:882, 927, 978`, `Stock.tsx:3410`, `Sidebar.tsx:79`, `Topbar.tsx:233`, `LicenceSection.tsx:101`) | Aplats neutres, l'accent seul | Signature visuelle « template IA ». |
| `Sparkles` + ⚡ (`Stock.tsx:2573, 2704, 2845, 2866-2868, 2971, 3145`, `AuthGate.tsx:757, 783, 830`, `LicenceSection.tsx:185`) | `Layers`, `RefreshCw`, `KeyRound`… selon le sens | Une baguette magique ne dit rien de l'action. |
| Émojis dans l'UI (`POS.tsx:1288, 1493, 1560`, `Dashboard.tsx:1104, 1142, 1144`, `Stock.tsx:3051, 3422, 3442`) | Texte + icône Lucide | Leur rendu varie selon les appareils, et ils donnent un ton amateur. |
| Modale desktop : ressort `scale 0.92 → 1`, voile `backdrop-blur-md` (`Modal.tsx:121, 133-137`) | `scale 0.98 + opacity`, 200 ms en `--ease-out`, voile opaque à 40 % sans flou | Plus rapide et moins coûteux. |
| Header desktop : 7 blocs (Wi-Fi, Caisse, magasin, cloche, profil, déconnexion, 4 thèmes, horloge) (`Topbar.tsx:262-306`) | Magasin + Caisse à gauche ; cloche + menu compte (thème, déconnexion) à droite | Trop de choses au même niveau visuel. |
| `rounded-3xl` (`AuthGate.tsx:402`, `Modal.tsx:137`, `LicenceGate.tsx:100`, `OnlineRequiredGate.tsx:33`, `ErrorBoundary.tsx:32`, `App.tsx:35`) | 12 px | Allure « bulle » peu sérieuse. |
| Violet pour les variantes, sur 83 lignes de `Stock.tsx` et 16 de `ProductCard.tsx` | Un jeton `variant` discret, ou rien | Le violet fait concurrence au bleu. |

### P2 : cohérence, dette, finition

| Avant | Après | Pourquoi |
| --- | --- | --- |
| Même icône `Users` pour Clients et Personnel (`Sidebar.tsx:59, 62`, `BottomNav.tsx:36, 39`) ; `Building2` pour Paramètres | `Users` / `UserCog` / `Settings` | Une icône = un sens. |
| Menu de la sidebar sans `aria-current` (`Sidebar.tsx:124-168`) | `aria-current="page"` comme `BottomNav.tsx:164` | Cohérence a11y. |
| Sidebar et AppLayout chargent chacun `/settings` (`Sidebar.tsx:41-48`, `AppLayout.tsx:42-51`) | Un seul contexte `settings` | Double appel, et le nom ou le logo peuvent différer un instant. |
| Horloge mise à jour chaque seconde pour n'afficher que les minutes (`Topbar.tsx:72`) | Minuteur calé sur la minute, chiffres tabulaires | Rendu inutile du header 60 fois par minute. |
| Règles `input[type=date]` en double (`index.css:376-435` et `458-471`) | Un seul bloc | La deuxième écrase la première. |
| `transition: all` sur `.glass-input` (`index.css:275`) | `transition: border-color, box-shadow 150ms` | M4. |
| Palette `apple.*` et ombres `glass*` inutilisées (`tailwind.config.js:15-41`) | Remplacées par les jetons F1 | Code mort. |
| `Stock.tsx` fait 3 645 lignes, `Dashboard.tsx` 1 654, `POS.tsx` 1 673 | Découper en sous-composants (`stock/ProductTable`, `stock/VariantEditor`…) | Une refonte écran par écran est impossible dans des fichiers aussi gros. |
| Le thème « Contraste » repose sur 17 `!important` (`index.css:334-373`) | Jetons redéfinis par thème | F10. |

## 4. Ordre de refonte conseillé

1. **Jetons et socle** : `tailwind.config.js` et `index.css` (F1 à F10, M3). La plupart des constats P1 disparaissent d'un coup, car 207 usages passent par les classes `glass-*`.
2. **Composants de base** : `Button`, `Card` (ex-`GlassCard`), `Badge`, `Modal`/feuille unique, toasts, `DateRangePicker` (C1 à C8, P0 focus et a11y).
3. **Coquille** : `Sidebar`, `Topbar`, `BottomNav` (icônes, header allégé, `aria-current`, textes en français).
4. **Caisse (`POS.tsx`, `ProductCard.tsx`)** en priorité, puisque c'est l'écran qui fait gagner de l'argent : cibles tactiles, panier mobile (N2), sans confettis.
5. **Tableau de bord**, puis **Stock** (découpage d'abord), **Clients**, **Ventes**, **Paramètres**, **AuthGate**.
6. Passe finale avec les skills du pack : `break-ui` sur chaque écran (données extrêmes), `review-animations` sur le mouvement restant, puis un test sur un vrai téléphone.

## 5. À garder

- Les fondations mobiles de `index.css:37-194` et leurs commentaires.
- `Modal.tsx` : portail, focus piégé, retour du focus, `Escape`, feuille en bas sur mobile.
- `BottomNav.tsx` : ordre par fréquence d'usage, feuille « Plus », `aria-current`, onglet « Plus » allumé quand la page courante s'y trouve.
- La police au choix de l'utilisateur (`--app-font`).
- Les styles d'impression des reçus et codes-barres (`index.css:473-630`).
