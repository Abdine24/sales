// Définitions de types partagées pour les données métier — l'app est online-only, toutes ces
// données vivent sur l'API du VPS (voir src/services/api.ts et server/), plus dans une base
// locale. Ce fichier ne contient plus que des types, aucun code d'exécution : Dexie a été
// retiré du projet une fois toutes les pages migrées vers l'API.

export interface AttributProduit {
  nom: string; // Ex: "Couleur", "Modèle", "Capacité"
  valeurs: string[]; // Ex: ["Noir Sidéral", "Titane Naturel", "Argent"]
}

export interface VarianteProduit {
  id: string; // Identifiant unique de la variante (ex: "var_ip17_noir_pro_256")
  attributs: Record<string, string>; // Ex: { "Couleur": "Noir Sidéral", "Modèle": "Pro", "Capacité": "256 Go" }
  prix: number;
  stock: number;
  cout_achat_unitaire?: number;
  code_barres?: string;
  image_url?: string;
}

export interface Produit {
  id?: number;
  nom: string;
  is_variable?: boolean; // false = produit simple, true = produit variable
  prix: number; // Prix simple ou prix de base
  cout_achat_unitaire?: number;
  stock: number; // Stock produit simple ou stock global agrégé
  code_barres: string;
  categorie: string;
  min_stock: number;
  image_url?: string;
  variantes?: string[]; // Legacy / tags simples
  attributs?: AttributProduit[]; // Définition des attributs (Couleur, Modèle, Capacité, etc.)
  variantes_detaillees?: VarianteProduit[]; // Combinaisons de variantes avec prix/stock propres
  zone_id?: number | null;
  fournisseur_id?: number;
}

export interface Categorie {
  id?: number;
  nom: string;
  description?: string;
}

export interface Zone {
  id?: number;
  nom: string;
  code: string;
  actif: boolean;
}

export interface AppSettings {
  id: 'principale';
  nom_site: string;
  slogan?: string;
  logo_url?: string;
  email?: string;
  telephone?: string;
  ifu?: string;
  rrcm?: string;
  localite?: string;

  // Format d'impression par défaut
  print_format_default?: 'thermique' | 'a4';

  // Options d'affichage sur le ticket de caisse
  ticket_show_logo?: boolean;
  ticket_show_vendeur?: boolean;
  ticket_show_adresse?: boolean;
  ticket_show_ifu?: boolean;
  ticket_show_qrcode?: boolean;
  ticket_footer_message?: string;

  // Bip sonore de caisse & scanner
  sound_enabled?: boolean;

  // WhatsApp Reçu & Remerciement
  whatsapp_enabled?: boolean;
  whatsapp_custom_message?: string;
  whatsapp_auto_open?: boolean;

  // Modèle de facture/reçu PDF choisi — id d'une ligne de control_plane.receipt_templates,
  // ajoutée par le propriétaire depuis la Console Propriétaire. null/absent = aucun modèle
  // configuré : la facture A4 (téléchargement, impression, WhatsApp) n'est alors pas disponible,
  // il n'existe plus aucun design de facture intégré à l'application.
  receipt_template_id?: string | null;
}

export type PersonnelRole = 'admin' | 'gerant' | 'caissier';

export interface Personnel {
  id?: number;
  identifiant: string;
  nom: string;
  username: string;
  email?: string;
  // Lie ce profil métier au compte Supabase Auth (auth.users.id), qui porte le mot de passe.
  supabase_user_id?: string;
  role: PersonnelRole;
  actif: boolean;
  principal: boolean;
  zone_id?: number | null;
  created_at: string;
  updated_at: string;
}

export interface Licence {
  id: 'principale';
  cle: string;
  activee_le: string;
  // Durée en jours encodée dans la clé (null = illimitée). Absent sur les licences
  // créées avant ce champ : on les traite comme illimitées (clause de grand-père).
  duree_jours?: number | null;
  // Date d'expiration calculée (activee_le + duree_jours), ISO. Null = illimitée.
  expire_le?: string | null;
  // true dès qu'un essai gratuit de 7 jours a été activé une fois — ne redevient jamais false,
  // même après l'avoir remplacé par une clé payante (voir server/src/routes/licenceStatus.js).
  trial_used?: boolean;
}

export interface Client {
  id?: number;
  nom: string;
  telephone: string;
  total_dette: number;
  email?: string;
  adresse?: string;
  vendeur_id?: number | null;
}

export interface Fournisseur {
  id?: number;
  nom: string;
  contact: string;
  email?: string;
}

export interface Vente {
  id: string; // UUID
  date: string; // ISO string
  client_id?: number | null;
  client_nom?: string;
  total: number;
  remise?: number;
  montant_paye: number;
  reste_a_payer: number;
  statut: 'paye' | 'partiel' | 'credit';
  methode_paiement: 'especes' | 'mobile_money' | 'virement';
  zone_id?: number | null;
  vendeur_id?: number | null;
  vendeur_nom?: string;
  vendeur_identifiant?: string;
}

export interface LigneVente {
  id?: number;
  vente_id: string;
  produit_id: number;
  variant_id?: string;
  produit_nom: string;
  variante?: string;
  quantite: number;
  prix_unitaire: number;
  cout_unitaire?: number;
}

export interface AchatStock {
  id?: number;
  date: string;
  fournisseur_id: number;
  fournisseur_nom?: string;
  produit_id: number;
  produit_nom?: string;
  variant_id?: string;
  variante?: string;
  quantite: number;
  cout_total: number;
  cout_unitaire?: number;
  zone_id?: number | null;
}

export type MotifAjustement = 'inventaire' | 'casse' | 'perte_vol' | 'don_promo' | 'autre';

export interface AjustementStock {
  id?: number;
  date: string;
  produit_id: number;
  produit_nom: string;
  variant_id?: string;
  variante?: string;
  ancien_stock: number;
  nouveau_stock: number;
  delta: number;
  motif: MotifAjustement;
  commentaire?: string;
  zone_id?: number | null;
  auteur?: string;
}

export interface PanierLigne {
  produit: Produit;
  quantite: number;
  variant_id?: string;
  variante?: string;
  prix_unitaire?: number;
}

export interface PanierEnAttente {
  id?: number;
  date: string;
  nom_reference: string;
  lignes: PanierLigne[];
  total: number;
  vendeur_id?: number | null;
}

export type MotifRetour = 'client_insatisfait' | 'defectueux' | 'erreur_caisse' | 'autre';
export type ModeRemboursement = 'especes' | 'mobile_money' | 'virement';

export interface RetourLigne {
  produit_id: number;
  variant_id?: string;
  produit_nom: string;
  variante?: string;
  quantite: number;
  prix_unitaire: number;
}

export interface Retour {
  id?: number;
  date: string;
  vente_id: string;
  client_id?: number | null;
  client_nom?: string;
  lignes: RetourLigne[];
  montant_total: number;
  mode_remboursement: ModeRemboursement;
  motif: MotifRetour;
  commentaire?: string;
  zone_id?: number | null;
  vendeur_id?: number | null;
  vendeur_nom?: string;
}

export type TypeReglement = 'paiement_dette' | 'acompte' | 'remboursement_retour';

export interface Reglement {
  id?: number;
  date: string; // ISO String
  client_id: number;
  client_nom: string;
  montant: number;
  mode_paiement: 'especes' | 'mobile_money' | 'virement';
  vendeur_id?: number | null;
  vendeur_nom?: string;
  vendeur_identifiant?: string;
  zone_id?: number | null;
  vente_id?: string;
  dette_avant?: number;
  dette_apres?: number;
  type: TypeReglement;
  note?: string;
}
