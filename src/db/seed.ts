import { db, Produit, Client, Fournisseur, Vente, LigneVente, AchatStock } from './db';

// Ajoute uniquement les catégories qui n'existent pas encore (index unique `&nom`)
async function ensureCategories(noms: string[]) {
  const existing = new Set((await db.categories.toArray()).map((categorie) => categorie.nom));
  const manquantes = Array.from(new Set(noms.filter(Boolean))).filter((nom) => !existing.has(nom));
  if (manquantes.length) {
    await db.categories.bulkAdd(manquantes.map((nom) => ({ nom })));
  }
}

// Déduplique les appels concurrents (React StrictMode monte les effets deux fois en dev)
let seedPromise: Promise<void> | null = null;

export function initializeSeedData(forceReset = false): Promise<void> {
  if (forceReset) {
    seedPromise = runSeed(true);
    return seedPromise;
  }
  if (!seedPromise) {
    seedPromise = runSeed(false).catch((err) => {
      seedPromise = null; // autorise une nouvelle tentative après échec
      throw err;
    });
  }
  return seedPromise;
}

async function runSeed(forceReset: boolean) {
  if (forceReset) {
    await db.produits.clear();
    await db.clients.clear();
    await db.fournisseurs.clear();
    await db.ventes.clear();
    await db.lignes_vente.clear();
    await db.achats_stock.clear();
    await db.categories.clear();
    await db.file_attente_sync.clear();
  }

  // Zone par défaut (créée par la migration v4) pour rattacher les données de démo
  const defaultZone = await db.zones.orderBy('id').first();
  const defaultZoneId = defaultZone?.id ?? null;

  const produitsCount = await db.produits.count();
  if (produitsCount > 0 && !forceReset) {
    const produits = await db.produits.toArray();
    await ensureCategories(produits.map((produit) => produit.categorie));
    return; // Already initialized
  }

  // 1. Fournisseurs
  const fournisseursData: Fournisseur[] = [
    { nom: 'Apple Distribution EMEA', contact: '+33 1 42 68 50 00', email: 'supply@apple-emea.com' },
    { nom: 'Global Tech Wholesale', contact: '+33 4 72 00 11 22', email: 'sales@globaltech.fr' },
  ];
  const fournisseurIds = await db.fournisseurs.bulkAdd(fournisseursData, { allKeys: true });

  // 2. Produits
  const produitsData: Produit[] = [
    {
      nom: 'AirPods 3',
      is_variable: false,
      prix: 120,
      stock: 25,
      code_barres: '194253003120',
      categorie: 'Audio',
      min_stock: 5,
    },
    {
      nom: 'iPhone 17',
      is_variable: true,
      prix: 969, // Prix indicatif de base
      stock: 35, // Total stock calculé
      code_barres: '194253017000',
      categorie: 'Smartphones',
      min_stock: 5,
      attributs: [
        {
          nom: 'Couleur',
          valeurs: ['Noir Sidéral', 'Titane Naturel', 'Bleu Pacifique'],
        },
        {
          nom: 'Modèle',
          valeurs: ['Standard', 'Pro', 'Pro Max'],
        },
        {
          nom: 'Capacité',
          valeurs: ['128 Go', '256 Go', '512 Go'],
        },
      ],
      variantes_detaillees: [
        // Standard
        {
          id: 'var_ip17_std_noir_128',
          attributs: { Couleur: 'Noir Sidéral', Modèle: 'Standard', Capacité: '128 Go' },
          prix: 969,
          stock: 8,
          code_barres: '194253017101',
        },
        {
          id: 'var_ip17_std_noir_256',
          attributs: { Couleur: 'Noir Sidéral', Modèle: 'Standard', Capacité: '256 Go' },
          prix: 1099,
          stock: 5,
          code_barres: '194253017102',
        },
        {
          id: 'var_ip17_std_noir_512',
          attributs: { Couleur: 'Noir Sidéral', Modèle: 'Standard', Capacité: '512 Go' },
          prix: 1349,
          stock: 3,
          code_barres: '194253017103',
        },
        {
          id: 'var_ip17_std_titane_128',
          attributs: { Couleur: 'Titane Naturel', Modèle: 'Standard', Capacité: '128 Go' },
          prix: 969,
          stock: 6,
          code_barres: '194253017104',
        },
        {
          id: 'var_ip17_std_titane_256',
          attributs: { Couleur: 'Titane Naturel', Modèle: 'Standard', Capacité: '256 Go' },
          prix: 1099,
          stock: 4,
          code_barres: '194253017105',
        },
        {
          id: 'var_ip17_std_titane_512',
          attributs: { Couleur: 'Titane Naturel', Modèle: 'Standard', Capacité: '512 Go' },
          prix: 1349,
          stock: 2,
          code_barres: '194253017106',
        },
        {
          id: 'var_ip17_std_bleu_128',
          attributs: { Couleur: 'Bleu Pacifique', Modèle: 'Standard', Capacité: '128 Go' },
          prix: 969,
          stock: 5,
          code_barres: '194253017107',
        },
        {
          id: 'var_ip17_std_bleu_256',
          attributs: { Couleur: 'Bleu Pacifique', Modèle: 'Standard', Capacité: '256 Go' },
          prix: 1099,
          stock: 3,
          code_barres: '194253017108',
        },
        {
          id: 'var_ip17_std_bleu_512',
          attributs: { Couleur: 'Bleu Pacifique', Modèle: 'Standard', Capacité: '512 Go' },
          prix: 1349,
          stock: 1,
          code_barres: '194253017109',
        },
        // Pro
        {
          id: 'var_ip17_pro_noir_128',
          attributs: { Couleur: 'Noir Sidéral', Modèle: 'Pro', Capacité: '128 Go' },
          prix: 1229,
          stock: 6,
          code_barres: '194253017201',
        },
        {
          id: 'var_ip17_pro_noir_256',
          attributs: { Couleur: 'Noir Sidéral', Modèle: 'Pro', Capacité: '256 Go' },
          prix: 1359,
          stock: 7,
          code_barres: '194253017202',
        },
        {
          id: 'var_ip17_pro_noir_512',
          attributs: { Couleur: 'Noir Sidéral', Modèle: 'Pro', Capacité: '512 Go' },
          prix: 1609,
          stock: 2,
          code_barres: '194253017203',
        },
        {
          id: 'var_ip17_pro_titane_128',
          attributs: { Couleur: 'Titane Naturel', Modèle: 'Pro', Capacité: '128 Go' },
          prix: 1229,
          stock: 5,
          code_barres: '194253017204',
        },
        {
          id: 'var_ip17_pro_titane_256',
          attributs: { Couleur: 'Titane Naturel', Modèle: 'Pro', Capacité: '256 Go' },
          prix: 1359,
          stock: 8,
          code_barres: '194253017205',
        },
        {
          id: 'var_ip17_pro_titane_512',
          attributs: { Couleur: 'Titane Naturel', Modèle: 'Pro', Capacité: '512 Go' },
          prix: 1609,
          stock: 3,
          code_barres: '194253017206',
        },
        {
          id: 'var_ip17_pro_bleu_128',
          attributs: { Couleur: 'Bleu Pacifique', Modèle: 'Pro', Capacité: '128 Go' },
          prix: 1229,
          stock: 4,
          code_barres: '194253017207',
        },
        {
          id: 'var_ip17_pro_bleu_256',
          attributs: { Couleur: 'Bleu Pacifique', Modèle: 'Pro', Capacité: '256 Go' },
          prix: 1359,
          stock: 4,
          code_barres: '194253017208',
        },
        {
          id: 'var_ip17_pro_bleu_512',
          attributs: { Couleur: 'Bleu Pacifique', Modèle: 'Pro', Capacité: '512 Go' },
          prix: 1609,
          stock: 2,
          code_barres: '194253017209',
        },
        // Pro Max
        {
          id: 'var_ip17_promax_noir_256',
          attributs: { Couleur: 'Noir Sidéral', Modèle: 'Pro Max', Capacité: '256 Go' },
          prix: 1479,
          stock: 6,
          code_barres: '194253017301',
        },
        {
          id: 'var_ip17_promax_noir_512',
          attributs: { Couleur: 'Noir Sidéral', Modèle: 'Pro Max', Capacité: '512 Go' },
          prix: 1729,
          stock: 3,
          code_barres: '194253017302',
        },
        {
          id: 'var_ip17_promax_titane_256',
          attributs: { Couleur: 'Titane Naturel', Modèle: 'Pro Max', Capacité: '256 Go' },
          prix: 1479,
          stock: 7,
          code_barres: '194253017303',
        },
        {
          id: 'var_ip17_promax_titane_512',
          attributs: { Couleur: 'Titane Naturel', Modèle: 'Pro Max', Capacité: '512 Go' },
          prix: 1729,
          stock: 4,
          code_barres: '194253017304',
        },
        {
          id: 'var_ip17_promax_bleu_256',
          attributs: { Couleur: 'Bleu Pacifique', Modèle: 'Pro Max', Capacité: '256 Go' },
          prix: 1479,
          stock: 5,
          code_barres: '194253017305',
        },
        {
          id: 'var_ip17_promax_bleu_512',
          attributs: { Couleur: 'Bleu Pacifique', Modèle: 'Pro Max', Capacité: '512 Go' },
          prix: 1729,
          stock: 2,
          code_barres: '194253017306',
        },
      ],
    },
    {
      nom: 'MacBook Pro 16" M3 Max',
      is_variable: false,
      prix: 3499,
      stock: 5,
      code_barres: '194253002002',
      categorie: 'Ordinateurs',
      min_stock: 2,
    },
    {
      nom: 'iPad Air M2 11" 128GB',
      is_variable: false,
      prix: 709,
      stock: 3, // Stock bas !
      code_barres: '194253004004',
      categorie: 'Tablettes',
      min_stock: 5,
    },
    {
      nom: 'Apple Watch Series 10',
      is_variable: true,
      prix: 479,
      stock: 15,
      code_barres: '194253005005',
      categorie: 'Accessoires',
      min_stock: 4,
      attributs: [
        {
          nom: 'Taille',
          valeurs: ['42 mm', '46 mm'],
        },
        {
          nom: 'Boîtier',
          valeurs: ['Aluminium', 'Titane'],
        },
      ],
      variantes_detaillees: [
        {
          id: 'var_aw10_alu_42',
          attributs: { Taille: '42 mm', Boîtier: 'Aluminium' },
          prix: 449,
          stock: 6,
        },
        {
          id: 'var_aw10_alu_46',
          attributs: { Taille: '46 mm', Boîtier: 'Aluminium' },
          prix: 479,
          stock: 5,
        },
        {
          id: 'var_aw10_tit_42',
          attributs: { Taille: '42 mm', Boîtier: 'Titane' },
          prix: 799,
          stock: 2,
        },
        {
          id: 'var_aw10_tit_46',
          attributs: { Taille: '46 mm', Boîtier: 'Titane' },
          prix: 849,
          stock: 2,
        },
      ],
    },
    {
      nom: 'Chargeur MagSafe 25W',
      is_variable: false,
      prix: 49,
      stock: 45,
      code_barres: '194253006006',
      categorie: 'Accessoires',
      min_stock: 10,
    },
  ];
  const produitIds = await db.produits.bulkAdd(
    produitsData.map((produit) => ({ ...produit, zone_id: defaultZoneId })),
    { allKeys: true }
  );
  await ensureCategories(produitsData.map((produit) => produit.categorie));

  // 3. Clients
  const clientsData: Client[] = [
    {
      nom: 'Jean-Marc Dupont',
      telephone: '06 12 34 56 78',
      total_dette: 450,
      email: 'jm.dupont@email.fr',
    },
    {
      nom: 'Sophie Martin',
      telephone: '06 98 76 54 32',
      total_dette: 0,
      email: 'sophie.m@email.fr',
    },
    {
      nom: 'Alexandre Leroy',
      telephone: '07 45 67 89 01',
      total_dette: 1250,
      email: 'a.leroy@techcorp.io',
    },
  ];
  const clientIds = await db.clients.bulkAdd(clientsData, { allKeys: true });

  // 4. Achats Stock initiaux
  const achatsData: AchatStock[] = [
    {
      date: new Date(Date.now() - 10 * 86400000).toISOString(),
      fournisseur_id: Number(fournisseurIds[0]),
      fournisseur_nom: 'Apple Distribution EMEA',
      produit_id: Number(produitIds[0]),
      produit_nom: 'iPhone 16 Pro Max 256GB',
      quantite: 20,
      cout_total: 24000,
      zone_id: defaultZoneId,
    },
    {
      date: new Date(Date.now() - 5 * 86400000).toISOString(),
      fournisseur_id: Number(fournisseurIds[1]),
      fournisseur_nom: 'Global Tech Wholesale',
      produit_id: Number(produitIds[2]),
      produit_nom: 'AirPods Pro (2ème gén)',
      quantite: 30,
      cout_total: 6000,
      zone_id: defaultZoneId,
    },
  ];
  await db.achats_stock.bulkAdd(achatsData);

  // 5. Generer 7 jours d'historique de ventes de démonstration
  const now = new Date();
  const ventesSample: Vente[] = [];
  const lignesSample: LigneVente[] = [];

  for (let i = 6; i >= 0; i--) {
    const saleDate = new Date(now.getTime() - i * 86400000);
    const saleCount = 2 + Math.floor(Math.random() * 3); // 2 à 4 ventes par jour

    for (let j = 0; j < saleCount; j++) {
      const saleId = crypto.randomUUID();
      const isClientSale = Math.random() > 0.4;
      const clientIndex = j % 3;
      const clientId = isClientSale ? Number(clientIds[clientIndex]) : null;
      const clientNom = isClientSale
        ? clientsData[clientIndex].nom
        : 'Client Passant';

      // 1 ou 2 produits par vente
      const productIndex = Math.floor(Math.random() * produitsData.length);
      const p1 = produitsData[productIndex];
      const q1 = Math.floor(Math.random() * 2) + 1;
      const total = p1.prix * q1;

      let montantPaye = total;
      let statut: 'paye' | 'partiel' | 'credit' = 'paye';
      let reste = 0;

      // Quelques ventes à crédit pour alimenter la démo
      if (isClientSale && i === 1 && j === 0) {
        montantPaye = total - 450;
        reste = 450;
        statut = 'partiel';
      }

      ventesSample.push({
        id: saleId,
        date: saleDate.toISOString(),
        client_id: clientId,
        client_nom: clientNom,
        total,
        montant_paye: Math.max(0, montantPaye),
        reste_a_payer: reste,
        statut,
        methode_paiement: j % 2 === 0 ? 'mobile_money' : 'especes',
        zone_id: defaultZoneId,
      });

      lignesSample.push({
        vente_id: saleId,
        produit_id: Number(produitIds[productIndex]),
        produit_nom: p1.nom,
        quantite: q1,
        prix_unitaire: p1.prix,
      });
    }
  }

  await db.ventes.bulkAdd(ventesSample);
  await db.lignes_vente.bulkAdd(lignesSample);
  console.log('Seed data successfully loaded into Dexie IndexedDB!');
}
