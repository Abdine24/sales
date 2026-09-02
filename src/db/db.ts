import Dexie, { Table } from 'dexie';

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
}

export type PersonnelRole = 'admin' | 'gerant' | 'caissier';

export interface Personnel {
  id?: number;
  identifiant: string;
  nom: string;
  username: string;
  email?: string;
  password_hash: string;
  // Lie ce profil métier au compte Supabase Auth (auth.users.id) qui porte désormais le
  // mot de passe réel. Absent sur les comptes créés avant la bascule vers Supabase Auth.
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

export interface SyncItem {
  id?: number;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  data: string; // JSON stringified data
  date_creation: string;
  status: 'en_attente' | 'synchronise' | 'echec';
  attempts?: number;
  last_error?: string;
  next_retry_at?: string; // ISO — n'est réessayé qu'après cette date (back-off)
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

export class VenteAppleDB extends Dexie {
  produits!: Table<Produit, number>;
  categories!: Table<Categorie, number>;
  personnel!: Table<Personnel, number>;
  licence!: Table<Licence, string>;
  zones!: Table<Zone, number>;
  settings!: Table<AppSettings, string>;
  clients!: Table<Client, number>;
  fournisseurs!: Table<Fournisseur, number>;
  ventes!: Table<Vente, string>;
  lignes_vente!: Table<LigneVente, number>;
  achats_stock!: Table<AchatStock, number>;
  ajustements_stock!: Table<AjustementStock, number>;
  file_attente_sync!: Table<SyncItem, number>;
  paniers_en_attente!: Table<PanierEnAttente, number>;
  retours!: Table<Retour, number>;
  reglements!: Table<Reglement, number>;

  constructor() {
    super('VenteAppleDB');
    this.version(1).stores({
      produits: '++id, nom, code_barres, categorie, stock',
      clients: '++id, nom, telephone, total_dette',
      fournisseurs: '++id, nom',
      ventes: 'id, date, client_id, statut',
      lignes_vente: '++id, vente_id, produit_id',
      achats_stock: '++id, date, fournisseur_id, produit_id',
      file_attente_sync: '++id, action, table, status, date_creation',
    });
    this.version(2)
      .stores({
        produits: '++id, nom, code_barres, categorie, stock',
        categories: '++id, &nom',
        clients: '++id, nom, telephone, total_dette',
        fournisseurs: '++id, nom',
        ventes: 'id, date, client_id, statut',
        lignes_vente: '++id, vente_id, produit_id',
        achats_stock: '++id, date, fournisseur_id, produit_id',
        file_attente_sync: '++id, action, table, status, date_creation',
      })
      .upgrade(async (trans) => {
        const produits = await trans.table('produits').toArray() as Produit[];
        const noms = Array.from(new Set(produits.map((produit) => produit.categorie).filter(Boolean)));
        await trans.table('categories').bulkAdd(noms.map((nom) => ({ nom })));
      });
    this.version(3).stores({
      produits: '++id, nom, code_barres, categorie, stock',
      categories: '++id, &nom',
      personnel: '++id, &username, role, actif, principal',
      licence: 'id',
      clients: '++id, nom, telephone, total_dette',
      fournisseurs: '++id, nom',
      ventes: 'id, date, client_id, statut',
      lignes_vente: '++id, vente_id, produit_id',
      achats_stock: '++id, date, fournisseur_id, produit_id',
      file_attente_sync: '++id, action, table, status, date_creation',
    });
    this.version(4).stores({
      produits: '++id, nom, code_barres, categorie, stock, zone_id',
      categories: '++id, &nom',
      personnel: '++id, &username, role, actif, principal, zone_id',
      licence: 'id',
      zones: '++id, &code, nom, actif',
      settings: 'id',
      clients: '++id, nom, telephone, total_dette',
      fournisseurs: '++id, nom',
      ventes: 'id, date, client_id, statut, zone_id',
      lignes_vente: '++id, vente_id, produit_id',
      achats_stock: '++id, date, fournisseur_id, produit_id, zone_id',
      file_attente_sync: '++id, action, table, status, date_creation',
    }).upgrade(async (trans) => {
      const zones = trans.table('zones');
      const defaultZoneId = await zones.add({ nom: 'Magasin principal', code: 'MAG-01', actif: true });
      await trans.table('produits').toCollection().modify({ zone_id: defaultZoneId });
      await trans.table('ventes').toCollection().modify({ zone_id: defaultZoneId });
      await trans.table('achats_stock').toCollection().modify({ zone_id: defaultZoneId });
      await trans.table('settings').put({ id: 'principale', nom_site: 'iVente Pro' });
    });
    this.version(5).stores({
      produits: '++id, nom, code_barres, categorie, stock, zone_id',
      categories: '++id, &nom',
      personnel: '++id, &username, &identifiant, role, actif, principal, zone_id',
      licence: 'id',
      zones: '++id, &code, nom, actif',
      settings: 'id',
      clients: '++id, nom, telephone, total_dette',
      fournisseurs: '++id, nom',
      ventes: 'id, date, client_id, statut, zone_id',
      lignes_vente: '++id, vente_id, produit_id',
      achats_stock: '++id, date, fournisseur_id, produit_id, zone_id',
      file_attente_sync: '++id, action, table, status, date_creation',
    }).upgrade(async (trans) => {
      const personnel = await trans.table('personnel').toArray() as Personnel[];
      const used = new Set<string>();
      for (const person of personnel) {
        let identifiant = person.identifiant;
        do {
          identifiant = Array.from(crypto.getRandomValues(new Uint8Array(10)))
            .map((value) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[value % 32])
            .join('');
        } while (used.has(identifiant));
        used.add(identifiant);
        await trans.table('personnel').update(person.id, { identifiant });
      }
    });
    this.version(6).stores({
      produits: '++id, nom, code_barres, categorie, stock, zone_id',
      categories: '++id, &nom',
      personnel: '++id, &username, &identifiant, role, actif, principal, zone_id',
      licence: 'id',
      zones: '++id, &code, nom, actif',
      settings: 'id',
      clients: '++id, nom, telephone, total_dette, vendeur_id',
      fournisseurs: '++id, nom',
      ventes: 'id, date, client_id, statut, zone_id, vendeur_id',
      lignes_vente: '++id, vente_id, produit_id',
      achats_stock: '++id, date, fournisseur_id, produit_id, zone_id',
      file_attente_sync: '++id, action, table, status, date_creation',
      paniers_en_attente: '++id, date, nom_reference, vendeur_id',
    });
    this.version(7).stores({
      produits: '++id, nom, code_barres, categorie, stock, zone_id',
      categories: '++id, &nom',
      personnel: '++id, &username, &identifiant, role, actif, principal, zone_id',
      licence: 'id',
      zones: '++id, &code, nom, actif',
      settings: 'id',
      clients: '++id, nom, telephone, total_dette, vendeur_id',
      fournisseurs: '++id, nom',
      ventes: 'id, date, client_id, statut, zone_id, vendeur_id',
      lignes_vente: '++id, vente_id, produit_id',
      achats_stock: '++id, date, fournisseur_id, produit_id, zone_id',
      ajustements_stock: '++id, date, produit_id, motif, zone_id',
      file_attente_sync: '++id, action, table, status, date_creation',
      paniers_en_attente: '++id, date, nom_reference, vendeur_id',
    });
    this.version(8).stores({
      produits: '++id, nom, code_barres, categorie, stock, zone_id',
      categories: '++id, &nom',
      personnel: '++id, &username, &identifiant, role, actif, principal, zone_id',
      licence: 'id',
      zones: '++id, &code, nom, actif',
      settings: 'id',
      clients: '++id, nom, telephone, total_dette, vendeur_id',
      fournisseurs: '++id, nom',
      ventes: 'id, date, client_id, statut, zone_id, vendeur_id',
      lignes_vente: '++id, vente_id, produit_id',
      achats_stock: '++id, date, fournisseur_id, produit_id, zone_id',
      ajustements_stock: '++id, date, produit_id, motif, zone_id',
      file_attente_sync: '++id, action, table, status, date_creation',
      paniers_en_attente: '++id, date, nom_reference, vendeur_id',
      retours: '++id, vente_id, date, client_id, zone_id',
    });
    this.version(9).stores({
      produits: '++id, nom, code_barres, categorie, stock, zone_id',
      categories: '++id, &nom',
      personnel: '++id, &username, &identifiant, role, actif, principal, zone_id',
      licence: 'id',
      zones: '++id, &code, nom, actif',
      settings: 'id',
      clients: '++id, nom, telephone, total_dette, vendeur_id',
      fournisseurs: '++id, nom',
      ventes: 'id, date, client_id, statut, zone_id, vendeur_id',
      lignes_vente: '++id, vente_id, produit_id',
      achats_stock: '++id, date, fournisseur_id, produit_id, zone_id',
      ajustements_stock: '++id, date, produit_id, motif, zone_id',
      file_attente_sync: '++id, action, table, status, date_creation',
      paniers_en_attente: '++id, date, nom_reference, vendeur_id',
      retours: '++id, vente_id, date, client_id, zone_id',
      reglements: '++id, date, client_id, vendeur_id, zone_id, type, vente_id',
    });
  }
}

export const db = new VenteAppleDB();
