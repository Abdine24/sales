import { Router } from 'express';
import { pool, withTransaction } from '../db.js';

export const ajustementsStockRouter = Router();

ajustementsStockRouter.get('/', async (_req, res) => {
  const { rows } = await pool.query('select * from ajustements_stock order by date desc');
  res.json(rows);
});

// Enregistre un ajustement d'inventaire (casse, perte, comptage...) et fixe le nouveau stock
// du produit, atomiquement. Pour les produits à variantes, ajuste la variante ciblée puis
// recalcule le stock agrégé.
ajustementsStockRouter.post('/', async (req, res) => {
  const body = req.body || {};
  if (!body.produit_id || body.nouveau_stock === undefined || !body.motif) {
    return res.status(400).json({ error: 'produit_id, nouveau_stock et motif sont requis.' });
  }

  try {
    const result = await withTransaction(async (client) => {
      const { rows: produitRows } = await client.query('select * from produits where id=$1 for update', [body.produit_id]);
      if (produitRows.length === 0) throw Object.assign(new Error('Produit introuvable.'), { status: 404 });
      const produit = produitRows[0];

      let ancienStock;
      if (body.variant_id && produit.variantes_detaillees) {
        const variante = produit.variantes_detaillees.find((v) => v.id === body.variant_id);
        ancienStock = variante?.stock ?? 0;
        const variantes = produit.variantes_detaillees.map((v) =>
          v.id === body.variant_id ? { ...v, stock: body.nouveau_stock } : v
        );
        const stockTotal = variantes.reduce((sum, v) => sum + v.stock, 0);
        await client.query('update produits set variantes_detaillees=$1, stock=$2 where id=$3', [
          JSON.stringify(variantes), stockTotal, produit.id,
        ]);
      } else {
        ancienStock = produit.stock;
        await client.query('update produits set stock=$1 where id=$2', [body.nouveau_stock, produit.id]);
      }

      const { rows } = await client.query(
        `insert into ajustements_stock
          (date, produit_id, produit_nom, variant_id, variante, ancien_stock, nouveau_stock,
           delta, motif, commentaire, zone_id, auteur)
         values (now(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         returning *`,
        [
          body.produit_id, body.produit_nom ?? produit.nom, body.variant_id ?? null, body.variante ?? null,
          ancienStock, body.nouveau_stock, body.nouveau_stock - ancienStock, body.motif,
          body.commentaire ?? null, body.zone_id ?? null, body.auteur ?? null,
        ]
      );
      return rows[0];
    });
    res.status(201).json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});
