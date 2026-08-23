# CAHIER DES CHARGES (SPEC.md) - APPLICATION DE GESTION "APPLE-STYLE" OFFLINE-FIRST

## 1. VISION DU PROJET
Créer une application web (PWA) de gestion de ventes, stocks, fournisseurs et créances (dettes). 
L'application doit fonctionner de manière fluide hors-ligne (Offline-First) et se synchroniser avec une base de données distante lors du retour du réseau. 
L'expérience utilisateur (UX) et l'interface (UI) doivent être exceptionnelles, fluides, avec des animations dignes de l'écosystème Apple (iOS/macOS).

## 2. STACK TECHNIQUE (À UTILISER STRICTEMENT)
- **Frontend** : React.js (TypeScript) avec Vite.
- **Styling** : Tailwind CSS + shadcn/ui.
- **Animations** : Framer Motion (obligatoire pour les transitions, modales et menus).
- **Graphiques interactifs** : Recharts (pour le tableau de bord).
- **Base de données Locale (Offline)** : Dexie.js (IndexedDB).
- **Base de données Distante (Online)** : Supabase (PostgreSQL).
- **Icônes** : Lucide React.
- **PWA** : vite-plugin-pwa (pour l'installation sur bureau/mobile).

## 3. LIGNES DIRECTRICES DE DESIGN (APPLE-STYLE)
L'IA doit respecter ces règles d'interface pour obtenir le rendu "Apple" :
- **Glassmorphism** : Utiliser `backdrop-blur-xl`, des fonds semi-transparents (`bg-white/70` en clair, `bg-gray-900/70` en sombre) pour les sidebars et les navbars.
- **Bordures et Ombres** : Utiliser des coins très arrondis sur les cartes (`rounded-2xl`, `rounded-3xl`), des bordures très subtiles (`border border-gray-200/50`), et des ombres douces (`shadow-sm` ou ombres diffuses personnalisées).
- **Typographie** : San Francisco (par défaut sur Mac/iOS) ou Inter. Poids des polices contrasté (Titres en gras et larges, sous-titres discrets en gris). Espaces généreux (beaucoup de padding).
- **Framer Motion Animations** :
  - Les pages doivent apparaître avec un léger *Fade & Slide up* (`initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}`).
  - Les boutons doivent avoir un effet "Spring" au clic (`whileTap={{ scale: 0.95 }}`).
  - Le tiroir de la caisse (Drawer) doit glisser avec une physique de ressort (spring physics) douce.
- **Graphiques (Recharts)** : Les lignes et barres doivent être arrondies, avec des *tooltips* interactifs au survol (hover) qui reprennent le style Glassmorphism.

## 4. SCHÉMA DE LA BASE DE DONNÉES (DEXIE & SUPABASE)
Les tables suivantes doivent exister en local (Dexie) et en ligne (Supabase) :

1. `produits` : id, nom, prix, stock, code_barres.
2. `clients` : id, nom, telephone, total_dette.
3. `fournisseurs` : id, nom, contact.
4. `ventes` : id (UUID), date, client_id (nullable), total, montant_paye, reste_a_payer, statut ('paye', 'partiel', 'credit').
5. `lignes_vente` : id, vente_id, produit_id, quantite, prix_unitaire.
6. `achats_stock` : id, date, fournisseur_id, produit_id, quantite, cout_total.
7. `file_attente_sync` : id, action ('INSERT', 'UPDATE'), table, data (JSON), date_creation, status ('en_attente').

## 5. RÈGLES DE LOGIQUE MÉTIER & OFFLINE
- **Offline-First Absolu** : Toute action (Vente, Ajout client) s'écrit TOUJOURS en premier dans `Dexie.js`. L'UI est mise à jour immédiatement. L'action est ajoutée dans `file_attente_sync`.
- **Worker de Synchronisation** : Un script en arrière-plan écoute l'état du réseau (`navigator.onLine`). Dès qu'Internet est là, il lit `file_attente_sync` et envoie les paquets à Supabase.
- **Gestion des Dettes** : Si `montant_paye` < `total` lors d'une vente, le reste est ajouté au `total_dette` du client. Le Dashboard doit afficher une alerte rouge "Créances en attente".

## 6. INSTRUCTIONS DE DÉVELOPPEMENT POUR L'IA (À FAIRE ÉTAPE PAR ÉTAPE)
*Ne génère pas tout le projet d'un coup. Suis cet ordre strictement :*

**ÉTAPE 1 : Initialisation & UI de base**
Configure Vite, Tailwind, shadcn/ui. Crée le layout de base (Sidebar Glassmorphism, Topbar, zone de contenu) avec Framer Motion pour le routage.

**ÉTAPE 2 : Modélisation Locale (Dexie)**
Crée le fichier `db.ts` avec Dexie et toutes les tables. Crée un script de "Seed" pour injecter 5 produits, 2 clients et 1 fournisseur de test dans Dexie.

**ÉTAPE 3 : Le Dashboard avec Recharts**
Crée la page d'accueil avec :
- 3 Cartes de statistiques animées (Chiffre d'affaires, Créances, Stocks bas).
- 1 Graphique Recharts interactif (Courbe des ventes de la semaine).

**ÉTAPE 4 : L'Interface de Caisse (POS)**
Une interface divisée en deux : à gauche la grille des produits (cartes cliquables), à droite un ticket de caisse animé. Validation de la vente gérant le paiement partiel (Dettes).

**ÉTAPE 5 : Fournisseurs et Clients**
Pages avec tableaux de données simples. Pour les clients, afficher bien en évidence les dettes et un bouton "Enregistrer un règlement".

**ÉTAPE 6 : Le Moteur de Synchronisation (PowerSync / Custom Sync)**
Créer le hook `useSync` qui gère la `file_attente_sync` vers Supabase en arrière-plan et gère l'affichage de la pastille réseau (Rouge=Offline, Vert=Online).
