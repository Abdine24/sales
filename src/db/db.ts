import Dexie, { Table } from 'dexie';

export interface Produit {
  id?: number;
  nom: string;
  prix: number;
  cout_achat_unitaire?: number;
  stock: number;
  code_barres: string;
  categorie: string;
  min_stock: number;
  image_url?: string;
  variantes?: string[];
  zone_id?: number | null;
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
}

export type PersonnelRole = 'admin' | 'gerant';

export interface Personnel {
  id?: number;
  identifiant: string;
  nom: string;
  username: string;
  password_hash: string;
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
}

export interface Client {
  id?: number;
  nom: string;
  telephone: string;
  total_dette: number;
  email?: string;
  adresse?: string;
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
  methode_paiement: 'especes' | 'carte' | 'virement' | 'mixte';
  zone_id?: number | null;
  vendeur_id?: number | null;
  vendeur_nom?: string;
  vendeur_identifiant?: string;
}

export interface LigneVente {
  id?: number;
  vente_id: string;
  produit_id: number;
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
  quantite: number;
  cout_total: number;
  zone_id?: number | null;
}

export interface SyncItem {
  id?: number;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  data: string; // JSON stringified data
  date_creation: string;
  status: 'en_attente' | 'synchronise';
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
  file_attente_sync!: Table<SyncItem, number>;

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
  }
}

export const db = new VenteAppleDB();
