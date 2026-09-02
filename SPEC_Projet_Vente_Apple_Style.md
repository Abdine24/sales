# CAHIER DES CHARGES (SPEC.md) - SaaS DE GESTION "APPLE-STYLE" OFFLINE-FIRST

## 1. VISION DU PROJET
Créer une plateforme SaaS B2B (Software as a Service) multi-locataires permettant aux commerçants de gérer leurs ventes (POS), stocks, fournisseurs et créances (dettes).
L'application doit fonctionner de manière fluide hors-ligne (Offline-First) pour garantir la continuité des ventes, et se synchroniser avec le cloud lors du retour du réseau.
L'expérience utilisateur (UX) et l'interface (UI) doivent être exceptionnelles, fluides, avec des animations dignes de l'écosystème Apple (iOS/macOS).

## 2. FONCTIONNALITÉS SaaS (FRONTEND)
Avant d'aborder le backend, voici les fonctionnalités frontales à implémenter pour un SaaS complet :
- **Landing Page & Authentification** : Page vitrine commerciale, connexion/inscription (Supabase Auth), mot de passe oublié.
- **Onboarding & Configuration Boutique** : Création du profil de la boutique après inscription (nom, logo, devise, taux de TVA, adresse).
- **Gestion des Rôles (RBAC)** : Interface permettant à l'Admin d'inviter des employés (Caissier, Gérant) avec des permissions restreintes (ex: un caissier n'a accès qu'à l'écran de caisse et pas au Dashboard financier).
- **Abonnements & Facturation** : Interface pour visualiser l'abonnement actuel (ex: Gratuit vs Pro), afficher les limites (ex: quota de ventes atteint) et redirection vers un portail de paiement (Stripe).
- **Caisse (POS) Avancée** : Impression de tickets de caisse (PDF ou format Thermique), gestion des dettes (paiements partiels), possibilité de mettre un panier "en attente" pour encaisser quelqu'un d'autre.
- **Exports & Rapports** : Exportation des données (Excel/CSV) pour la comptabilité et graphiques analytiques détaillés.

## 3. STACK TECHNIQUE (À UTILISER STRICTEMENT)
- **Frontend** : React.js (TypeScript) avec Vite.
- **Styling** : Tailwind CSS + shadcn/ui.
- **Animations** : Framer Motion (obligatoire pour les transitions, modales et menus).
- **Graphiques interactifs** : Recharts (pour le tableau de bord).
- **Base de données Locale (Offline)** : Dexie.js (IndexedDB).
- **Base de données Distante (Online)** : Supabase (PostgreSQL + Auth + RLS).
- **Icônes** : Lucide React.
- **PWA** : vite-plugin-pwa (pour l'installation sur bureau/mobile).
- **Paiements** : Stripe (à intégrer ultérieurement pour le SaaS).

## 4. LIGNES DIRECTRICES DE DESIGN (APPLE-STYLE)
L'IA doit respecter ces règles d'interface pour obtenir le rendu "Apple" :
- **Glassmorphism** : Utiliser `backdrop-blur-xl`, des fonds semi-transparents (`bg-white/70` en clair, `bg-gray-900/70` en sombre) pour les sidebars et les navbars.
- **Bordures et Ombres** : Utiliser des coins très arrondis sur les cartes (`rounded-2xl`, `rounded-3xl`), des bordures très subtiles (`border border-gray-200/50`), et des ombres douces (`shadow-sm` ou ombres diffuses personnalisées).
- **Typographie** : San Francisco (par défaut sur Mac/iOS) ou Inter. Poids des polices contrasté (Titres en gras et larges, sous-titres discrets en gris). Espaces généreux (beaucoup de padding).
- **Framer Motion Animations** :
  - Les pages doivent apparaître avec un léger *Fade & Slide up* (`initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}`).
  - Les boutons doivent avoir un effet "Spring" au clic (`whileTap={{ scale: 0.95 }}`).
  - Le tiroir de la caisse (Drawer) ou les modales doivent glisser avec une physique de ressort (spring physics) douce.
- **Graphiques (Recharts)** : Les lignes et barres doivent être arrondies, avec des *tooltips* interactifs au survol (hover) qui reprennent le style Glassmorphism.

## 5. SCHÉMA DE LA BASE DE DONNÉES LOCAL (DEXIE - MULTI-TENANT READY)
Pour supporter le SaaS en mode hors-ligne, les entités locales doivent stocker l'état. (Le backend Supabase gérera les vrais `tenant_id`).
1. `auth_session` : Stocke le token de l'utilisateur actif et son rôle (Admin, Caissier).
2. `settings_boutique` : id, nom_boutique, logo, devise, format_ticket (A4, 80mm).
3. `produits` : id, nom, prix, stock, code_barres, categorie.
4. `clients` : id, nom, telephone, total_dette.
5. `fournisseurs` : id, nom, contact.
6. `ventes` : id (UUID), date, client_id (nullable), total, montant_paye, reste_a_payer, statut ('paye', 'partiel', 'credit'), caissier_id.
7. `lignes_vente` : id, vente_id, produit_id, quantite, prix_unitaire.
8. `achats_stock` : id, date, fournisseur_id, produit_id, quantite, cout_total.
9. `file_attente_sync` : id, action ('INSERT', 'UPDATE', 'DELETE'), table, data (JSON), date_creation, status ('en_attente').

## 6. RÈGLES DE LOGIQUE MÉTIER & OFFLINE
- **Offline-First Absolu** : Toute action s'écrit TOUJOURS en premier dans `Dexie.js`. L'UI est mise à jour immédiatement. L'action est ajoutée dans `file_attente_sync`.
- **Worker de Synchronisation** : Un script écoute l'état du réseau (`navigator.onLine`). Dès qu'Internet est là, il envoie les paquets à Supabase.
- **Isolation SaaS (Local)** : Lors du login, Dexie charge un snapshot des données de la boutique du client depuis Supabase. Si l'utilisateur se déconnecte, les tables Dexie contenant des données sensibles doivent être vidées (ou sécurisées) pour ne pas être vues par une autre boutique sur le même appareil.

## 7. INSTRUCTIONS DE DÉVELOPPEMENT FRONTEND (À FAIRE ÉTAPE PAR ÉTAPE)
*Ne génère pas tout le projet d'un coup. Suis cet ordre strictement pour développer les fonctionnalités UI :*

**ÉTAPE 1 : Configuration et Architecture SaaS**
- Configure Vite, Tailwind, shadcn/ui. 
- Crée le système de routage avec un `AuthGuard` (Routes publiques pour Landing/Login vs Routes privées pour l'App).

**ÉTAPE 2 : Modélisation Locale (Dexie) pour le SaaS**
- Crée le fichier `db.ts` avec Dexie et toutes les tables. Ajoute un script de "Seed" pour remplir la base locale avec des données factices pour tester l'interface.

**ÉTAPE 3 : Layout et Configuration Boutique (Settings)**
- Implémente le Layout principal (Sidebar Glassmorphism, Topbar profil).
- Crée la page "Paramètres" pour définir le nom de la boutique, la devise, et gérer les rôles des employés (UI).

**ÉTAPE 4 : Dashboard Analytique SaaS**
- Crée la vue Admin avec : Cartes de statistiques (CA, Dettes en cours, Stock faible) et un Graphique Recharts interactif (Courbe des ventes de la semaine).

**ÉTAPE 5 : L'Interface de Caisse (POS)**
- Une interface divisée en deux : à gauche la grille des produits, à droite le ticket.
- Gère la validation de la vente avec paiement partiel (création de dette) et un bouton "Imprimer" (génération PDF du reçu).

**ÉTAPE 6 : Gestion Commerciale & Export**
- Pages de gestion (Produits, Clients, Fournisseurs).
- Pour les clients, afficher les dettes avec bouton "Enregistrer règlement".
- Ajout des boutons "Exporter en CSV" pour les tableaux.

**ÉTAPE 7 : Le Moteur de Synchronisation SaaS**
- Créer le hook `useSync` qui traite `file_attente_sync` et gère l'affichage de la pastille réseau. (La connexion réelle à Supabase sera faite dans la phase Backend).
