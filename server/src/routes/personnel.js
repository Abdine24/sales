import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { getSupabaseAdmin } from '../supabaseAdmin.js';
import { recordUtilisateurBoutique } from '../personnelLookup.js';

export const personnelRouter = Router();

const RANDOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0/O/1/I

const generateIdentifiant = () => {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => RANDOM_ALPHABET[b % RANDOM_ALPHABET.length]).join('');
};

const generateUniqueIdentifiant = async (tenantPool) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const identifiant = generateIdentifiant();
    const { rows } = await tenantPool.query('select 1 from personnel where identifiant=$1', [identifiant]);
    if (rows.length === 0) return identifiant;
  }
  throw new Error("Impossible de générer un identifiant unique — réessaie.");
};

personnelRouter.get('/', async (req, res) => {
  const { rows } = await req.tenantPool.query('select * from personnel order by nom asc');
  res.json(rows);
});

// Résout le profil métier (rôle, zone...) de l'utilisateur Supabase actuellement authentifié.
// Renvoie 404 si le jeton Supabase est valide mais qu'aucun profil local n'a encore été créé
// pour cet utilisateur (ex: compte tout juste activé).
personnelRouter.get('/me', async (req, res) => {
  const { rows } = await req.tenantPool.query(
    'select * from personnel where supabase_user_id=$1 or (email=$2 and supabase_user_id is null)',
    [req.user.id, req.user.email]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Aucun profil personnel pour ce compte.' });
  // Rattrape les comptes créés avant la liaison supabase_user_id.
  if (!rows[0].supabase_user_id) {
    await req.tenantPool.query('update personnel set supabase_user_id=$1 where id=$2', [req.user.id, rows[0].id]);
    rows[0].supabase_user_id = req.user.id;
    await recordUtilisateurBoutique(req.user.id, req.boutique.id, rows[0].email);
  }
  res.json(rows[0]);
});

// Crée un profil personnel. Deux cas :
//  1. Bootstrap (principal=true) : le tout premier admin de la boutique, qui vient de créer
//     son propre compte Supabase (OTP, voir AuthGate) — supabase_user_id est déjà fourni,
//     pas de mot de passe à gérer ici. Autorisé uniquement s'il n'existe aucun principal.
//  2. Ajout d'un membre par un admin : celui-ci fixe directement le mot de passe (product
//     decision : c'est l'admin qui gère les identifiants de son équipe, pas chacun pour soi).
//     Le compte Supabase est alors créé ici, côté serveur, via la clé service_role.
personnelRouter.post('/', async (req, res) => {
  const body = req.body || {};
  if (!body.nom || !body.username || !body.role) {
    return res.status(400).json({ error: 'nom, username et role sont requis.' });
  }

  const isBootstrap = body.principal === true;
  if (isBootstrap) {
    const { rows: existing } = await req.tenantPool.query('select 1 from personnel where principal=true limit 1');
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Un administrateur principal existe déjà pour cette boutique.' });
    }
  } else {
    const { rows: caller } = await req.tenantPool.query('select role from personnel where supabase_user_id=$1', [req.user.id]);
    if (caller.length === 0 || caller[0].role !== 'admin') {
      return res.status(403).json({ error: 'Réservé aux administrateurs.' });
    }
  }

  let supabaseUserId = body.supabase_user_id || null;
  let createdSupabaseUser = false;
  if (!supabaseUserId) {
    if (!body.email || !body.password) {
      return res.status(400).json({ error: 'email et password sont requis pour créer le compte.' });
    }
    if (body.password.length < 6) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères.' });
    }
    try {
      const { data, error } = await getSupabaseAdmin().auth.admin.createUser({
        email: body.email.trim().toLowerCase(),
        password: body.password,
        email_confirm: true,
      });
      if (error) return res.status(409).json({ error: error.message || 'Impossible de créer le compte pour cet email.' });
      supabaseUserId = data.user.id;
      createdSupabaseUser = true;
    } catch (err) {
      return res.status(500).json({ error: err.message || "Échec de la création du compte." });
    }
  }

  const identifiant = body.identifiant || (await generateUniqueIdentifiant(req.tenantPool));
  try {
    const { rows } = await req.tenantPool.query(
      `insert into personnel
        (identifiant, nom, username, email, supabase_user_id, role, actif, principal, zone_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       returning *`,
      [
        identifiant,
        body.nom,
        body.username.trim().toLowerCase(),
        body.email ? body.email.trim().toLowerCase() : null,
        supabaseUserId,
        body.role,
        body.actif ?? true,
        body.principal ?? false,
        body.zone_id ?? null,
      ]
    );
    // Écrit la correspondance utilisateur Supabase -> boutique dans la base de contrôle, pour
    // que resolveTenant (tenantResolver.js) sache plus tard à quelle boutique cet utilisateur
    // appartient — que ce soit l'admin qui vient de faire son bootstrap, ou un employé que
    // l'admin vient d'ajouter (les deux passent par ici, avec un supabase_user_id à ce stade).
    if (supabaseUserId) {
      await recordUtilisateurBoutique(supabaseUserId, req.boutique.id, rows[0].email);
    }
    res.status(201).json(rows[0]);
  } catch (err) {
    // Ne JAMAIS supprimer automatiquement le compte Supabase ici, même s'il vient d'être créé
    // dans cette même requête : un compte "orphelin" (sans ligne personnel) est un problème
    // mineur et récupérable, alors qu'une suppression a un rayon d'action qu'on ne maîtrise
    // pas totalement (ex: si supabaseUserId a été mal résolu, ça peut viser un tout autre
    // compte). Un compte orphelin se nettoie à la main via SQL si besoin.
    if (createdSupabaseUser) {
      console.error(
        `Compte Supabase ${supabaseUserId} créé mais profil personnel non enregistré (${err.message}). Nettoyage manuel à prévoir si besoin.`
      );
    }
    if (err.code === '23505') {
      return res.status(409).json({ error: "Ce nom d'utilisateur ou cet identifiant existe déjà." });
    }
    throw err;
  }
});

// Change le mot de passe d'un membre — réservé aux admins (c'est l'admin qui gère les
// identifiants de son équipe, voir aussi POST / ci-dessus).
personnelRouter.put('/:id/mot-de-passe', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identifiant invalide.' });
  const password = req.body?.password;
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères.' });
  }

  const { rows } = await req.tenantPool.query('select supabase_user_id from personnel where id=$1', [id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Introuvable.' });
  if (!rows[0].supabase_user_id) {
    return res.status(409).json({ error: "Ce profil n'est rattaché à aucun compte de connexion." });
  }

  const { error } = await getSupabaseAdmin().auth.admin.updateUserById(rows[0].supabase_user_id, { password });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

personnelRouter.put('/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identifiant invalide.' });
  const body = req.body || {};
  const columns = ['nom', 'username', 'email', 'role', 'actif', 'principal', 'zone_id'];
  const provided = columns.filter((c) => body[c] !== undefined);
  if (provided.length === 0) {
    const { rows } = await req.tenantPool.query('select * from personnel where id=$1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Introuvable.' });
    return res.json(rows[0]);
  }
  const setClause = provided.map((c, i) => `${c}=$${i + 1}`).join(',') + ', updated_at=now()';
  const { rows } = await req.tenantPool.query(
    `update personnel set ${setClause} where id=$${provided.length + 1} returning *`,
    [...provided.map((c) => body[c]), id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Introuvable.' });
  res.json(rows[0]);
});

personnelRouter.delete('/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identifiant invalide.' });
  const { rowCount } = await req.tenantPool.query('delete from personnel where id=$1', [id]);
  if (rowCount === 0) return res.status(404).json({ error: 'Introuvable.' });
  res.status(204).send();
});
