import { Router } from 'express';


export const notificationsRouter = Router();

// Résout le profil personnel de l'appelant (id + rôle) — plusieurs routes ici en ont besoin.
async function resolveCaller(req) {
  const { rows } = await req.tenantPool.query('select id, role from personnel where supabase_user_id=$1', [req.user.id]);
  return rows[0] || null;
}

// Liste les notifications visibles par l'utilisateur : diffusées à son rôle, ou qui lui sont
// adressées directement.
notificationsRouter.get('/', async (req, res) => {
  const caller = await resolveCaller(req);
  if (!caller) return res.json([]);
  const { rows } = await req.tenantPool.query(
    `select * from notifications
     where target_personnel_id=$1 or target_role=$2
     order by created_at desc
     limit 50`,
    [caller.id, caller.role]
  );
  res.json(rows);
});

notificationsRouter.put('/:id/lu', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identifiant invalide.' });
  const { rows } = await req.tenantPool.query('update notifications set read=true where id=$1 returning *', [id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Introuvable.' });
  res.json(rows[0]);
});

notificationsRouter.put('/lu-tout', async (req, res) => {
  const caller = await resolveCaller(req);
  if (!caller) return res.json({ success: true });
  await req.tenantPool.query(
    'update notifications set read=true where target_personnel_id=$1 or target_role=$2',
    [caller.id, caller.role]
  );
  res.json({ success: true });
});
