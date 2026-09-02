import { Router } from 'express';
import { pool, withTransaction } from '../db.js';

export const ventesRouter = Router();

ventesRouter.get('/', async (req, res) => {
  const { zone_id } = req.query;
  const params = [];
  let where = '';
  if (zone_id) {
    params.push(zone_id);
    where = `where zone_id = $${params.length}`;
  }
  const { rows } = await pool.query(`select * from ventes ${where} order by date desc`, params);
  res.json(rows);
});

// Toutes les lignes de vente, à plat — le frontend les associe à chaque vente par vente_id
// (même pattern que l'ancien accès Dexie, pour limiter la casse pendant la migration).
ventesRouter.get('/lignes/all', async (_req, res) => {
  const { rows } = await pool.query('select * from lignes_vente order by id asc');
  res.json(rows);
});

const insufficientStockError = (nom, dispo) =>
  Object.assign(new Error(`Stock insuffisant pour « ${nom} » : il reste ${dispo} unité(s).`), { status: 409 });

// Enregistre une vente complète (vente + lignes + décrément de stock + dette client) dans une
// seule transaction Postgres — même logique que l'ancienne transaction Dexie de POS.tsx.
ventesRouter.post('/', async (req, res) => {
  const body = req.body || {};
  const lignes = Array.isArray(body.lignes) ? body.lignes : [];
  if (lignes.length === 0) {
    return res.status(400).json({ error: 'La vente doit contenir au moins une ligne.' });
  }
  if ((body.reste_a_payer || 0) > 0 && !body.client_id) {
    return res.status(400).json({ error: 'Un client est requis pour enregistrer un reste à payer en dette.' });
  }

  try {
    const result = await withTransaction(async (client) => {
      const venteId = crypto.randomUUID();
      const date = new Date().toISOString();

      // 1. Verrouille et vérifie le stock de tous les produits concernés avant toute écriture.
      const produitsFrais = new Map();
      for (const ligne of lignes) {
        if (produitsFrais.has(ligne.produit_id)) continue;
        const { rows } = await client.query('select * from produits where id=$1 for update', [ligne.produit_id]);
        if (rows.length === 0) throw Object.assign(new Error(`Produit introuvable (#${ligne.produit_id}).`), { status: 404 });
        produitsFrais.set(ligne.produit_id, rows[0]);
      }
      for (const ligne of lignes) {
        const produit = produitsFrais.get(ligne.produit_id);
        if (ligne.variant_id && produit.variantes_detaillees) {
          const variante = produit.variantes_detaillees.find((v) => v.id === ligne.variant_id);
          if (!variante || variante.stock < ligne.quantite) {
            throw insufficientStockError(`${produit.nom} (${ligne.variante || ligne.variant_id})`, variante?.stock ?? 0);
          }
        } else if (produit.stock < ligne.quantite) {
          throw insufficientStockError(produit.nom, produit.stock);
        }
      }

      // 2. Vente
      await client.query(
        `insert into ventes
          (id, date, client_id, client_nom, total, remise, montant_paye, reste_a_payer, statut,
           methode_paiement, zone_id, vendeur_id, vendeur_nom, vendeur_identifiant)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          venteId, date, body.client_id ?? null, body.client_nom ?? 'Client Passant', body.total ?? 0,
          body.remise ?? null, body.montant_paye ?? 0, body.reste_a_payer ?? 0, body.statut,
          body.methode_paiement, body.zone_id ?? null, body.vendeur_id ?? null,
          body.vendeur_nom ?? null, body.vendeur_identifiant ?? null,
        ]
      );

      // 3. Lignes + décrément du stock (JSON pour les variantes, recalcul du total agrégé)
      for (const ligne of lignes) {
        const produit = produitsFrais.get(ligne.produit_id);
        await client.query(
          `insert into lignes_vente
            (vente_id, produit_id, variant_id, produit_nom, variante, quantite, prix_unitaire, cout_unitaire)
           values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            venteId, ligne.produit_id, ligne.variant_id ?? null, ligne.produit_nom, ligne.variante ?? null,
            ligne.quantite, ligne.prix_unitaire, ligne.cout_unitaire ?? produit.cout_achat_unitaire ?? null,
          ]
        );

        if (ligne.variant_id && produit.variantes_detaillees) {
          const variantes = produit.variantes_detaillees.map((v) =>
            v.id === ligne.variant_id ? { ...v, stock: v.stock - ligne.quantite } : v
          );
          const stockTotal = variantes.reduce((sum, v) => sum + v.stock, 0);
          await client.query('update produits set variantes_detaillees=$1, stock=$2 where id=$3', [
            JSON.stringify(variantes), stockTotal, produit.id,
          ]);
          produit.variantes_detaillees = variantes; // pour la ligne suivante si même produit
        } else {
          produit.stock -= ligne.quantite;
          await client.query('update produits set stock=$1 where id=$2', [produit.stock, produit.id]);
        }
      }

      // 4. Dette client (relue avec verrou dans la transaction)
      let updatedClientDebt = null;
      if (body.client_id && (body.reste_a_payer || 0) > 0) {
        const { rows } = await client.query('select total_dette from clients where id=$1 for update', [body.client_id]);
        if (rows.length > 0) {
          updatedClientDebt = (Number(rows[0].total_dette) || 0) + Number(body.reste_a_payer);
          await client.query('update clients set total_dette=$1 where id=$2', [updatedClientDebt, body.client_id]);
        }
      }

      const { rows: venteRows } = await client.query('select * from ventes where id=$1', [venteId]);
      const { rows: ligneRows } = await client.query('select * from lignes_vente where vente_id=$1', [venteId]);
      return { vente: venteRows[0], lignes: ligneRows, client_total_dette: updatedClientDebt };
    });
    res.status(201).json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});
