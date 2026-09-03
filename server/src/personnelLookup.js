import { controlPlanePool } from './controlPlaneDb.js';

// Résout la ligne `personnel` de l'utilisateur actuellement authentifié, dans la boutique déjà
// résolue par le middleware tenantResolver.js (req.tenantPool). Centralise ce qui était
// auparavant dupliqué dans auth.js (requireAdmin), personnel.js (3 endroits) et
// notifications.js (resolveCaller) — chacun de ces endroits a de toute façon besoin d'être
// adapté pour recevoir le contexte tenant, donc c'est le bon moment pour ne plus le répéter.
export async function getCallerPersonnel(req) {
  const { rows } = await req.tenantPool.query(
    'select * from personnel where supabase_user_id=$1',
    [req.user.id]
  );
  return rows[0] || null;
}

// Enregistre (ou met à jour) la correspondance utilisateur Supabase -> boutique dans la base
// de contrôle — nécessaire pour que resolveTenant (tenantResolver.js) sache plus tard à
// quelle boutique cet utilisateur appartient. Appelée chaque fois qu'un supabase_user_id est
// rattaché à une ligne personnel (création bootstrap, admin qui ajoute un employé, ou lien
// tardif via /personnel/me) — jamais de retrait automatique : un personnel désactivé ou
// supprimé garde sa correspondance, sans conséquence (elle n'est consultée qu'à la connexion,
// où le profil désactivé est de toute façon rejeté par ailleurs).
//
// Écriture non-atomique entre deux bases (Postgres ne permet pas de transaction
// cross-database) : en cas d'échec après l'écriture personnel côté boutique, on se retrouve
// avec une correspondance orpheline — même risque déjà accepté pour les comptes Supabase
// orphelins (voir routes/personnel.js), nettoyage manuel SQL si jamais ça arrive.
export async function recordUtilisateurBoutique(supabaseUserId, boutiqueId, email) {
  if (!supabaseUserId || !boutiqueId) return;
  await controlPlanePool.query(
    `insert into utilisateurs_boutiques (supabase_user_id, boutique_id, email)
     values ($1,$2,$3)
     on conflict (supabase_user_id) do nothing`,
    [supabaseUserId, boutiqueId, email ?? null]
  );
}
