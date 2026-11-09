import { Router } from 'express';


export const retoursRouter = Router();

retoursRouter.get('/', async (req, res) => {
  const { rows } = await req.tenantPool.query('select * from retours order by date desc');
  res.json(rows);
});

const httpError = (status, message) => Object.assign(new Error(message), { status });

const toCents = (value) => Math.round(Number(value) * 100);
const fromCents = (cents) => cents / 100;
const lineKey = (produitId, variantId) => `${produitId}|${variantId || ''}`;

// Enregistre un retour : remet le stock des articles retournés, journalise le retour, et si la
// vente d'origine avait laissé un reste à payer, réduit la dette du client + trace un règlement
// de type "remboursement_retour" — même logique que l'ancienne transaction Dexie de Ventes.tsx.
//
// Tout est contrôlé ici contre la vente d'origine (source de vérité), plus rien n'est repris
// tel quel du navigateur :
//   - la vente doit exister, et chaque article retourné doit en faire partie ;
//   - quantité retournée ≤ quantité vendue − quantités déjà retournées (tous retours confondus) ;
//   - montant = quantités × prix unitaire de la vente ;
//   - client = celui de la vente ;
//   - la dette n'est réduite qu'à hauteur de ce que CETTE vente avait laissé à payer (moins les
//     retours déjà déduits) — le reste est remboursé par le mode choisi. Avant, un retour sur
//     une vente payée comptant effaçait aussi la dette du client sur d'autres achats.
retoursRouter.post('/', async (req, res) => {
  const body = req.body || {};
  const lignes = Array.isArray(body.lignes) ? body.lignes : [];
  if (lignes.length === 0) {
    return res.status(400).json({ error: 'Le retour doit contenir au moins une ligne.' });
  }
  if (!body.vente_id) {
    return res.status(400).json({ error: "Un retour doit être rattaché à la vente d'origine." });
  }
  for (const [index, ligne] of lignes.entries()) {
    if (!Number.isInteger(ligne?.produit_id) || !Number.isInteger(ligne.quantite) || ligne.quantite <= 0) {
      return res.status(400).json({ error: `Ligne ${index + 1} : produit ou quantité invalide.` });
    }
  }

  try {
    const result = await req.withTenantTransaction(async (client) => {
      // 0. Vente d'origine, verrouillée : deux retours simultanés sur la même vente ne peuvent pas
      //    tous les deux voir le même « déjà retourné ».
      const { rows: venteRows } = await client.query('select * from ventes where id=$1 for update', [body.vente_id]);
      const vente = venteRows[0];
      if (!vente) throw httpError(404, 'Vente introuvable.');

      const { rows: lignesVente } = await client.query(
        'select produit_id, variant_id, produit_nom, variante, quantite, prix_unitaire from lignes_vente where vente_id=$1 order by id asc',
        [vente.id]
      );
      const vendu = new Map(); // clé -> { quantite, prix (de la 1re ligne), produit_nom, variante }
      for (const l of lignesVente) {
        const key = lineKey(l.produit_id, l.variant_id);
        const entry = vendu.get(key);
        if (entry) entry.quantite += l.quantite;
        else vendu.set(key, { quantite: l.quantite, prix: Number(l.prix_unitaire), produit_nom: l.produit_nom, variante: l.variante });
      }

      const { rows: retoursPrecedents } = await client.query('select lignes from retours where vente_id=$1', [vente.id]);
      const dejaRetourne = new Map();
      for (const r of retoursPrecedents) {
        for (const l of r.lignes || []) {
          const key = lineKey(l.produit_id, l.variant_id);
          dejaRetourne.set(key, (dejaRetourne.get(key) || 0) + (Number(l.quantite) || 0));
        }
      }

      // Lignes du retour normalisées depuis la vente (prix, libellés), quantités cumulées.
      const demandees = new Map();
      for (const ligne of lignes) {
        const key = lineKey(ligne.produit_id, ligne.variant_id);
        demandees.set(key, (demandees.get(key) || 0) + ligne.quantite);
      }
      const lignesRetour = [];
      let montantCents = 0;
      for (const [key, quantite] of demandees) {
        const v = vendu.get(key);
        const [produitId, variantId] = key.split('|');
        if (!v) throw httpError(400, "Un des articles retournés ne fait pas partie de cette vente.");
        const restant = v.quantite - (dejaRetourne.get(key) || 0);
        if (quantite > restant) {
          const nom = v.variante ? `${v.produit_nom} (${v.variante})` : v.produit_nom;
          throw httpError(409, `Retour impossible pour « ${nom} » : ${restant} unité(s) encore retournable(s) sur cette vente.`);
        }
        lignesRetour.push({
          produit_id: Number(produitId),
          variant_id: variantId || undefined,
          produit_nom: v.produit_nom,
          variante: v.variante ?? undefined,
          quantite,
          prix_unitaire: v.prix,
        });
        montantCents += Math.round(quantite * toCents(v.prix));
      }
      const montantTotal = fromCents(montantCents);

      // 1. Remise en stock
      for (const ligne of lignesRetour) {
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
          date, vente.id, vente.client_id ?? null, vente.client_nom ?? null,
          JSON.stringify(lignesRetour), montantTotal, body.mode_remboursement,
          body.motif, body.commentaire ?? null, body.zone_id ?? null,
          body.vendeur_id ?? null, body.vendeur_nom ?? null,
        ]
      );

      // 3. Réduction de dette, plafonnée à ce que cette vente avait laissé à payer, moins les
      //    retours déjà déduits de la dette pour elle.
      let reglement = null;
      if (vente.client_id) {
        const { rows: dejaDeduit } = await client.query(
          `select coalesce(sum(dette_avant - dette_apres), 0) as total from reglements
           where vente_id=$1 and type='remboursement_retour'`,
          [vente.id]
        );
        const deductibleCents = Math.max(0, toCents(vente.reste_a_payer || 0) - toCents(dejaDeduit[0].total));
        const { rows: clientRows } = await client.query('select nom, total_dette from clients where id=$1 for update', [vente.client_id]);
        if (clientRows.length > 0 && deductibleCents > 0) {
          const detteAvantCents = toCents(clientRows[0].total_dette || 0);
          const deductionCents = Math.min(montantCents, deductibleCents, detteAvantCents);
          if (deductionCents > 0) {
            const detteApres = fromCents(detteAvantCents - deductionCents);
            await client.query('update clients set total_dette=$1 where id=$2', [detteApres, vente.client_id]);

            const motifLabel = body.motif_label || body.motif;
            const note = `Remboursement retour article (${motifLabel})${body.commentaire ? ` : ${body.commentaire}` : ''}`;
            const { rows: regRows } = await client.query(
              `insert into reglements
                (date, client_id, client_nom, montant, mode_paiement, vendeur_id, vendeur_nom,
                 vendeur_identifiant, zone_id, vente_id, dette_avant, dette_apres, type, note)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'remboursement_retour',$13)
               returning *`,
              [
                date, vente.client_id, vente.client_nom || clientRows[0].nom, fromCents(deductionCents),
                body.mode_remboursement, body.vendeur_id ?? null, body.vendeur_nom ?? null,
                body.vendeur_identifiant ?? null, body.zone_id ?? null, vente.id,
                fromCents(detteAvantCents), detteApres, note,
              ]
            );
            reglement = regRows[0];
          }
        }
      }

      return { retour: retourRows[0], reglement };
    });
    res.status(201).json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});
