import { db, Produit, Client, Fournisseur, Vente, LigneVente, AchatStock } from './db';

export async function initializeSeedData(forceReset = false) {
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

  const produitsCount = await db.produits.count();
  if (produitsCount > 0 && !forceReset) {
    const categoriesCount = await db.categories.count();
    if (categoriesCount === 0) {
      const produits = await db.produits.toArray();
      const categories = Array.from(new Set(produits.map((produit) => produit.categorie).filter(Boolean)));
      await db.categories.bulkAdd(categories.map((nom) => ({ nom })));
    }
    return; // Already initialized
  }

  // 1. Fournisseurs
  const fournisseursData: Fournisseur[] = [
    { nom: 'Apple Distribution EMEA', contact: '+33 1 42 68 50 00', email: 'supply@apple-emea.com' },
    { nom: 'Global Tech Wholesale', contact: '+33 4 72 00 11 22', email: 'sales@globaltech.fr' },
  ];
  await db.fournisseurs.bulkAdd(fournisseursData);

  // 2. Produits
  const produitsData: Produit[] = [
    {
      nom: 'iPhone 16 Pro Max 256GB',
      prix: 1479,
      stock: 14,
      code_barres: '194253001001',
      categorie: 'Smartphones',
      min_stock: 5,
    },
    {
      nom: 'MacBook Pro 16" M3 Max',
      prix: 3499,
      stock: 5,
      code_barres: '194253002002',
      categorie: 'Ordinateurs',
      min_stock: 2,
    },
    {
      nom: 'AirPods Pro (2ème gén)',
      prix: 279,
      stock: 28,
      code_barres: '194253003003',
      categorie: 'Audio',
      min_stock: 8,
    },
    {
      nom: 'iPad Air M2 11" 128GB',
      prix: 709,
      stock: 3, // Stock bas !
      code_barres: '194253004004',
      categorie: 'Tablettes',
      min_stock: 5,
    },
    {
      nom: 'Apple Watch Series 10 46mm',
      prix: 479,
      stock: 2, // Stock bas !
      code_barres: '194253005005',
      categorie: 'Accessoires',
      min_stock: 4,
    },
    {
      nom: 'Chargeur MagSafe 25W',
      prix: 49,
      stock: 45,
      code_barres: '194253006006',
      categorie: 'Accessoires',
      min_stock: 10,
    },
  ];
  await db.produits.bulkAdd(produitsData);
  await db.categories.bulkAdd(
    Array.from(new Set(produitsData.map((produit) => produit.categorie))).map((nom) => ({ nom }))
  );

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
  await db.clients.bulkAdd(clientsData);

  // 4. Achats Stock initiaux
  const achatsData: AchatStock[] = [
    {
      date: new Date(Date.now() - 10 * 86400000).toISOString(),
      fournisseur_id: 1,
      fournisseur_nom: 'Apple Distribution EMEA',
      produit_id: 1,
      produit_nom: 'iPhone 16 Pro Max 256GB',
      quantite: 20,
      cout_total: 24000,
    },
    {
      date: new Date(Date.now() - 5 * 86400000).toISOString(),
      fournisseur_id: 2,
      fournisseur_nom: 'Global Tech Wholesale',
      produit_id: 3,
      produit_nom: 'AirPods Pro (2ème gén)',
      quantite: 30,
      cout_total: 6000,
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
      const clientId = isClientSale ? (j % 3) + 1 : null;
      const clientNom = isClientSale
        ? clientsData[(j % 3)].nom
        : 'Client Passant';

      // 1 ou 2 produits par vente
      const p1 = produitsData[Math.floor(Math.random() * produitsData.length)];
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
        methode_paiement: j % 2 === 0 ? 'carte' : 'especes',
      });

      lignesSample.push({
        vente_id: saleId,
        produit_id: (p1 as any).id || (Math.floor(Math.random() * 6) + 1),
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
