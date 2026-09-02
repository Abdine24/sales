import { Router } from 'express';
import { pool, withTransaction } from '../db.js';

export const achatsStockRouter = Router();

achatsStockRouter.get('/', async (_req, res) => {
  const { rows } = await pool.query('select * from achats_stock order by date desc');
  res.json(rows);
});

// Enregistre un achat fournisseur et incrémente le stock du produit concerné, atomiquement.
achatsStockRouter.post('/', async (req, res) => {
  const body = req.body || {};
  if (!body.produit_id || !body.quantite || body.quantite <= 0) {
    return res.status(400).json({ error: 'produit_id et quantite (> 0) sont requis.' });
  }

  try {
    const result = await withTransaction(async (client) => {
      const { rows: produitRows } = await client.query('select * from produits where id=$1 for update', [body.produit_id]);
      if (produitRows.length === 0) throw Object.assign(new Error('Produit introuvable.'), { status: 404 });
      const produit = produitRows[0];

      if (body.variant_id && produit.variantes_detaillees) {
        const variantes = produit.variantes_detaillees.map((v) =>
          v.id === body.variant_id ? { ...v, stock: v.stock + body.quantite } : v
        );
        const stockTotal = variantes.reduce((sum, v) => sum + v.stock, 0);
        await client.query('update produits set variantes_detaillees=$1, stock=$2 where id=$3', [
          JSON.stringify(variantes), stockTotal, produit.id,
        ]);
      } else {
        await client.query('update produits set stock=stock+$1 where id=$2', [body.quantite, produit.id]);
      }

      const { rows } = await client.query(
        `insert into achats_stock
          (date, fournisseur_id, fournisseur_nom, produit_id, produit_nom, variant_id, variante,
           quantite, cout_total, cout_unitaire, zone_id)
         values (now(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         returning *`,
        [
          body.fournisseur_id ?? null, body.fournisseur_nom ?? null, body.produit_id,
          body.produit_nom ?? produit.nom, body.variant_id ?? null, body.variante ?? null,
          body.quantite, body.cout_total ?? 0, body.cout_unitaire ?? null, body.zone_id ?? null,
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
