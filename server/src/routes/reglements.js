import { Router } from 'express';


export const reglementsRouter = Router();

reglementsRouter.get('/', async (req, res) => {
  const { client_id } = req.query;
  const params = [];
  let where = '';
  if (client_id) {
    params.push(client_id);
    where = `where client_id = $${params.length}`;
  }
  const { rows } = await req.tenantPool.query(
    `select * from reglements ${where} order by date desc`,
    params
  );
  res.json(rows);
});

// Enregistre un règlement (paiement de dette, acompte...) et ajuste la dette du client dans
// la même transaction. dette_avant/dette_apres sont calculés côté serveur (source de vérité),
// pas repris de ce que le client aurait pu envoyer.
reglementsRouter.post('/', async (req, res) => {
  const body = req.body || {};
  if (!body.client_id || !body.montant || body.montant <= 0 || !body.type) {
    return res.status(400).json({ error: 'client_id, montant (> 0) et type sont requis.' });
  }

  try {
    const result = await req.withTenantTransaction(async (client) => {
      const clientRows = await client.query('select * from clients where id=$1 for update', [body.client_id]);
      if (clientRows.rows.length === 0) throw Object.assign(new Error('Client introuvable.'), { status: 404 });
      const detteAvant = Number(clientRows.rows[0].total_dette) || 0;
      const detteApres = Math.max(0, detteAvant - Number(body.montant));

      await client.query('update clients set total_dette=$1 where id=$2', [detteApres, body.client_id]);

      const { rows } = await client.query(
        `insert into reglements
          (client_id, client_nom, montant, mode_paiement, vendeur_id, vendeur_nom,
           vendeur_identifiant, zone_id, vente_id, dette_avant, dette_apres, type, note)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         returning *`,
        [
          body.client_id,
          body.client_nom || clientRows.rows[0].nom,
          body.montant,
          body.mode_paiement || 'especes',
          body.vendeur_id ?? null,
          body.vendeur_nom ?? null,
          body.vendeur_identifiant ?? null,
          body.zone_id ?? null,
          body.vente_id ?? null,
          detteAvant,
          detteApres,
          body.type,
          body.note ?? null,
        ]
      );
      return rows[0];
    });
    res.status(201).json(result);
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: err.message });
    throw err;
  }
});
