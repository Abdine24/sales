import { Router } from 'express';


export const ventesRouter = Router();

ventesRouter.get('/', async (req, res) => {
  const { zone_id } = req.query;
  const params = [];
  let where = '';
  if (zone_id) {
    params.push(zone_id);
    where = `where zone_id = $${params.length}`;
  }
  const { rows } = await req.tenantPool.query(`select * from ventes ${where} order by date desc`, params);
  res.json(rows);
});

// Toutes les lignes de vente, à plat — le frontend les associe à chaque vente par vente_id
// (même pattern que l'ancien accès Dexie, pour limiter la casse pendant la migration).
ventesRouter.get('/lignes/all', async (req, res) => {
  const { rows } = await req.tenantPool.query('select * from lignes_vente order by id asc');
  res.json(rows);
});

const insufficientStockError = (nom, dispo) =>
  Object.assign(new Error(`Stock insuffisant pour « ${nom} » : il reste ${dispo} unité(s).`), { status: 409 });

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

// Montants en centimes entiers pour les calculs (numeric(12,2) en base) : évite les écarts
// d'arrondi des flottants (0,1 + 0,2...) entre le total recalculé ici et celui de l'écran.
const toCents = (value) => Math.round(Number(value) * 100);
const fromCents = (cents) => cents / 100;
const isAmount = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

// Vérifie et normalise les lignes envoyées par la caisse. Le prix unitaire reste celui envoyé
// (la boutique peut saisir le prix à la vente, voir settings.saisie_prix_a_la_vente) ; la
// quantité, elle, doit être un entier strictement positif — une quantité négative AUGMENTAIT
// le stock en passant la vérification « stock < quantité ».
function parseLignes(lignes) {
  return lignes.map((ligne, index) => {
    const n = index + 1;
    if (!Number.isInteger(ligne?.produit_id) || ligne.produit_id <= 0) {
      throw badRequest(`Ligne ${n} : produit invalide.`);
    }
    if (!Number.isInteger(ligne.quantite) || ligne.quantite <= 0) {
      throw badRequest(`Ligne ${n} : la quantité doit être un nombre entier supérieur à 0.`);
    }
    if (!isAmount(ligne.prix_unitaire)) {
      throw badRequest(`Ligne ${n} : prix unitaire invalide.`);
    }
    return { ...ligne, variant_id: ligne.variant_id || null };
  });
}

// Enregistre une vente complète (vente + lignes + décrément de stock + dette client) dans une
// seule transaction Postgres — même logique que l'ancienne transaction Dexie de POS.tsx.
//
// Les montants sont recalculés ici à partir des lignes (source de vérité), comme le fait la
// caisse : total = somme(quantité × prix) − remise, montant payé plafonné au total, reste à
// payer = total − payé, statut déduit. Seuls la remise et la somme versée viennent du client.
ventesRouter.post('/', async (req, res) => {
  const body = req.body || {};
  if (!Array.isArray(body.lignes) || body.lignes.length === 0) {
    return res.status(400).json({ error: 'La vente doit contenir au moins une ligne.' });
  }
  let lignes;
  try {
    lignes = parseLignes(body.lignes);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const remise = body.remise ?? 0;
  const montantVerse = body.montant_paye ?? 0;
  if (!isAmount(remise)) return res.status(400).json({ error: 'Remise invalide.' });
  if (!isAmount(montantVerse)) return res.status(400).json({ error: 'Montant payé invalide.' });

  const sousTotalCents = lignes.reduce((sum, l) => sum + Math.round(l.quantite * toCents(l.prix_unitaire)), 0);
  const remiseCents = toCents(remise);
  if (remiseCents > sousTotalCents) {
    return res.status(400).json({ error: 'La remise ne peut pas dépasser le total de la vente.' });
  }
  const totalCents = sousTotalCents - remiseCents;
  const payeCents = Math.min(toCents(montantVerse), totalCents);
  const resteCents = totalCents - payeCents;
  const statut = resteCents === 0 ? 'paye' : payeCents === 0 ? 'credit' : 'partiel';

  if (resteCents > 0 && !body.client_id) {
    return res.status(400).json({ error: 'Un client est requis pour enregistrer un reste à payer en dette.' });
  }

  try {
    const result = await req.withTenantTransaction(async (client) => {
      const venteId = crypto.randomUUID();
      const date = new Date().toISOString();

      // 1. Verrouille et vérifie le stock de tous les produits concernés avant toute écriture.
      //    Les quantités sont cumulées par produit/variante : deux lignes du même article
      //    étaient chacune comparées au stock de départ, ce qui permettait de survendre.
      const produitsFrais = new Map();
      const demandes = new Map(); // "produitId|variantId" -> quantité totale demandée
      for (const ligne of lignes) {
        if (!produitsFrais.has(ligne.produit_id)) {
          const { rows } = await client.query('select * from produits where id=$1 for update', [ligne.produit_id]);
          if (rows.length === 0) throw Object.assign(new Error(`Produit introuvable (#${ligne.produit_id}).`), { status: 404 });
          produitsFrais.set(ligne.produit_id, rows[0]);
        }
        const produit = produitsFrais.get(ligne.produit_id);
        const variantKey = ligne.variant_id && produit.variantes_detaillees ? ligne.variant_id : '';
        const key = `${ligne.produit_id}|${variantKey}`;
        demandes.set(key, (demandes.get(key) || 0) + ligne.quantite);
      }
      for (const [key, quantite] of demandes) {
        const [produitId, variantId] = key.split('|');
        const produit = produitsFrais.get(Number(produitId));
        if (variantId) {
          const variante = produit.variantes_detaillees.find((v) => v.id === variantId);
          if (!variante || variante.stock < quantite) {
            const ligne = lignes.find((l) => l.produit_id === produit.id && l.variant_id === variantId);
            throw insufficientStockError(`${produit.nom} (${ligne?.variante || variantId})`, variante?.stock ?? 0);
          }
        } else if (produit.stock < quantite) {
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
          venteId, date, body.client_id ?? null, body.client_nom ?? 'Client Passant', fromCents(totalCents),
          body.remise == null ? null : fromCents(remiseCents), fromCents(payeCents), fromCents(resteCents), statut,
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
            venteId, ligne.produit_id, ligne.variant_id, ligne.produit_nom ?? produit.nom, ligne.variante ?? null,
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

      // 4. Numérotation légale de facture — allouée ICI, atomiquement, à la validation de la
      // vente (jamais à l'ouverture du PDF : sinon un aperçu suivi d'une annulation
      // consommerait un numéro pour rien). `update ... returning` sur une ligne par année
      // sérialise les ventes concurrentes sur ce verrou de ligne — deux validations simultanées
      // obtiennent forcément deux valeurs consécutives, jamais la même (voir schema.sql).
      const annee = new Date(date).getFullYear();
      await client.query(
        `insert into facture_sequences (annee, dernier_sequence) values ($1, 0)
         on conflict (annee) do nothing`,
        [annee]
      );
      const { rows: seqRows } = await client.query(
        `update facture_sequences set dernier_sequence = dernier_sequence + 1
         where annee = $1
         returning dernier_sequence`,
        [annee]
      );
      const sequence = seqRows[0].dernier_sequence;
      const numeroFacture = `FAC-${annee}-${String(sequence).padStart(4, '0')}`;
      await client.query(
        `insert into factures (vente_id, numero, annee, sequence) values ($1,$2,$3,$4)`,
        [venteId, numeroFacture, annee, sequence]
      );

      // 5. Dette client (relue avec verrou dans la transaction). Un client inconnu fait échouer
      // toute la vente : sinon le reste à payer n'était inscrit nulle part.
      let updatedClientDebt = null;
      if (body.client_id && resteCents > 0) {
        const { rows } = await client.query('select total_dette from clients where id=$1 for update', [body.client_id]);
        if (rows.length === 0) throw Object.assign(new Error('Client introuvable.'), { status: 404 });
        updatedClientDebt = fromCents(toCents(rows[0].total_dette || 0) + resteCents);
        await client.query('update clients set total_dette=$1 where id=$2', [updatedClientDebt, body.client_id]);
      }

      const { rows: venteRows } = await client.query('select * from ventes where id=$1', [venteId]);
      const { rows: ligneRows } = await client.query('select * from lignes_vente where vente_id=$1', [venteId]);
      return { vente: venteRows[0], lignes: ligneRows, client_total_dette: updatedClientDebt, numero_facture: numeroFacture };
    });
    res.status(201).json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});
