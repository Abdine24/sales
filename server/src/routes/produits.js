import { Router } from 'express';

export const produitsRouter = Router();

const toRow = (p) => ({
  nom: p.nom,
  prix: p.prix ?? 0,
  cout_achat_unitaire: p.cout_achat_unitaire ?? null,
  stock: p.stock ?? 0,
  code_barres: p.code_barres ?? null,
  categorie: p.categorie ?? null,
  min_stock: p.min_stock ?? 0,
  image_url: p.image_url ?? null,
  variantes: p.variantes ? JSON.stringify(p.variantes) : null,
  is_variable: Boolean(p.is_variable),
  attributs: p.attributs ? JSON.stringify(p.attributs) : null,
  variantes_detaillees: p.variantes_detaillees ? JSON.stringify(p.variantes_detaillees) : null,
  zone_id: p.zone_id ?? null,
});

// GET /produits — liste complète, filtrable par zone (?zone_id=)
produitsRouter.get('/', async (req, res) => {
  const { zone_id } = req.query;
  const params = [];
  let where = '';
  if (zone_id) {
    params.push(zone_id);
    where = `where zone_id = $${params.length}`;
  }
  const { rows } = await req.tenantPool.query(
    `select * from produits ${where} order by nom asc`,
    params
  );
  res.json(rows);
});

// POST /produits — création
produitsRouter.post('/', async (req, res) => {
  const row = toRow(req.body || {});
  if (!row.nom || !row.nom.trim()) {
    return res.status(400).json({ error: 'Le nom du produit est requis.' });
  }
  const { rows } = await req.tenantPool.query(
    `insert into produits
      (nom, prix, cout_achat_unitaire, stock, code_barres, categorie, min_stock, image_url,
       variantes, is_variable, attributs, variantes_detaillees, zone_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     returning *`,
    [
      row.nom, row.prix, row.cout_achat_unitaire, row.stock, row.code_barres, row.categorie,
      row.min_stock, row.image_url, row.variantes, row.is_variable, row.attributs,
      row.variantes_detaillees, row.zone_id,
    ]
  );
  res.status(201).json(rows[0]);
});

// PUT /produits/:id — mise à jour complète
produitsRouter.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identifiant invalide.' });
  const row = toRow(req.body || {});
  const { rows } = await req.tenantPool.query(
    `update produits set
       nom=$1, prix=$2, cout_achat_unitaire=$3, stock=$4, code_barres=$5, categorie=$6,
       min_stock=$7, image_url=$8, variantes=$9, is_variable=$10, attributs=$11,
       variantes_detaillees=$12, zone_id=$13, updated_at=now()
     where id=$14
     returning *`,
    [
      row.nom, row.prix, row.cout_achat_unitaire, row.stock, row.code_barres, row.categorie,
      row.min_stock, row.image_url, row.variantes, row.is_variable, row.attributs,
      row.variantes_detaillees, row.zone_id, id,
    ]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Produit introuvable.' });
  res.json(rows[0]);
});

// DELETE /produits/:id
produitsRouter.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identifiant invalide.' });
  const { rowCount } = await req.tenantPool.query('delete from produits where id=$1', [id]);
  if (rowCount === 0) return res.status(404).json({ error: 'Produit introuvable.' });
  res.status(204).send();
});
