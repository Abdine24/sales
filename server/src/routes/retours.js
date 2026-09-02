import { Router } from 'express';
import { pool, withTransaction } from '../db.js';

export const retoursRouter = Router();

retoursRouter.get('/', async (_req, res) => {
  const { rows } = await pool.query('select * from retours order by date desc');
  res.json(rows);
});

// Enregistre un retour : remet le stock des articles retournés, journalise le retour, et si
// une vente à crédit est concernée, réduit la dette du client + trace un règlement de type
// "remboursement_retour" — même logique que l'ancienne transaction Dexie de Ventes.tsx.
retoursRouter.post('/', async (req, res) => {
  const body = req.body || {};
  const lignes = Array.isArray(body.lignes) ? body.lignes : [];
  if (lignes.length === 0) {
    return res.status(400).json({ error: 'Le retour doit contenir au moins une ligne.' });
  }

  const result = await withTransaction(async (client) => {
    // 1. Remise en stock
    for (const ligne of lignes) {
      const { rows } = await client.query('select * from produits where id=$1 for update', [ligne.produit_id]);
      if (rows.length === 0) continue; // produit supprimé depuis : on n'échoue pas le retour pour ça
      const produit = rows[0];
      if (ligne.variant_id && produit.variantes_detaillees) {
        const variantes = produit.variantes_detaillees.map((v) =>
          v.id === ligne.variant_id ? { ...v, stock: v.stock + ligne.quantite } : v
        );
        const stockTotal = variantes.reduce((sum, v) => sum + v.stock, 0);
        await client.query('update produits set variantes_detaillees=$1, stock=$2 where id=$3', [
          JSON.stringify(variantes), stockTotal, produit.id,
        ]);
      } else {
        await client.query('update produits set stock=stock+$1 where id=$2', [ligne.quantite, produit.id]);
      }
    }

    // 2. Enregistre le retour
    const date = new Date().toISOString();
    const { rows: retourRows } = await client.query(
      `insert into retours
        (date, vente_id, client_id, client_nom, lignes, montant_total, mode_remboursement,
         motif, commentaire, zone_id, vendeur_id, vendeur_nom)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       returning *`,
      [
        date, body.vente_id ?? null, body.client_id ?? null, body.client_nom ?? null,
        JSON.stringify(lignes), body.montant_total ?? 0, body.mode_remboursement,
        body.motif, body.commentaire ?? null, body.zone_id ?? null,
        body.vendeur_id ?? null, body.vendeur_nom ?? null,
      ]
    );

    // 3. Trace comptable + réduction de dette si la vente d'origine était liée à un client
    let reglement = null;
    if (body.client_id && body.client_nom) {
      const { rows: clientRows } = await client.query('select total_dette from clients where id=$1 for update', [body.client_id]);
      if (clientRows.length > 0) {
        const detteAvant = Number(clientRows[0].total_dette) || 0;
        const detteApres = Math.max(0, detteAvant - Number(body.montant_total || 0));
        await client.query('update clients set total_dette=$1 where id=$2', [detteApres, body.client_id]);

        const motifLabel = body.motif_label || body.motif;
        const note = `Remboursement retour article (${motifLabel})${body.commentaire ? ` : ${body.commentaire}` : ''}`;
        const { rows: regRows } = await client.query(
          `insert into reglements
            (date, client_id, client_nom, montant, mode_paiement, vendeur_id, vendeur_nom,
             vendeur_identifiant, zone_id, vente_id, dette_avant, dette_apres, type, note)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'remboursement_retour',$13)
           returning *`,
          [
            date, body.client_id, body.client_nom, body.montant_total ?? 0, body.mode_remboursement,
            body.vendeur_id ?? null, body.vendeur_nom ?? null, body.vendeur_identifiant ?? null,
            body.zone_id ?? null, body.vente_id ?? null, detteAvant, detteApres, note,
          ]
        );
        reglement = regRows[0];
      }
    }

    return { retour: retourRows[0], reglement };
  });

  res.status(201).json(result);
});
