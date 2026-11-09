import { getCallerPersonnel } from './personnelLookup.js';

// Contrôle d'accès des routes métier, à monter APRÈS requireAuth et resolveTenant.
//
// Avant ce fichier, le serveur vérifiait seulement que le jeton Supabase était valide et que
// son utilisateur n'était pas rattaché à une AUTRE boutique : un compte tout juste inscrit (sans
// rattachement) pouvait donc lire et modifier les données de n'importe quelle boutique, et les
// rôles, la désactivation d'un employé et l'expiration de la licence n'étaient vérifiés que dans
// le navigateur. Chaque route métier passe désormais par `access({...})`, qui exige :
//   1. une fiche personnel ACTIVE dans cette boutique pour l'utilisateur du jeton ;
//   2. un rôle autorisé pour la lecture (GET) ou l'écriture (tout le reste) ;
//   3. pour les écritures, une licence non expirée (si `licence: true`).

export const ALL = ['admin', 'gerant', 'caissier'];
export const STAFF = ['admin', 'gerant'];
export const ADMIN = ['admin'];

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const deny = (res, status, error, code) => res.status(status).json(code ? { error, code } : { error });

// Activation d'une nouvelle boutique : tant qu'aucun administrateur principal n'existe, le
// créateur de la boutique n'a pas encore de fiche personnel — c'est justement ce qu'il est en
// train de créer (voir src/services/localAuth.ts : POST /licence/activer, puis POST /personnel).
export async function boutiqueHasPrincipal(req) {
  const { rows } = await req.tenantPool.query('select 1 from personnel where principal=true limit 1');
  return rows.length > 0;
}

// Licence expirée = date d'expiration dépassée — même règle que l'écran LicenceGate côté client
// (src/utils/license.ts) : une licence absente n'est pas bloquée ici, pour ne jamais verrouiller
// une boutique historique créée avant l'activation obligatoire.
async function licenceExpired(req) {
  const { rows } = await req.tenantPool.query("select expire_le from licence where id='principale'");
  const expireLe = rows[0]?.expire_le;
  return Boolean(expireLe) && new Date(expireLe).getTime() <= Date.now();
}

/**
 * @param {object} options
 * @param {string[]} [options.read]   rôles autorisés en lecture (GET)
 * @param {string[]} [options.write]  rôles autorisés en écriture (POST/PUT/DELETE)
 * @param {boolean}  [options.licence] refuser les écritures si la licence a expiré
 * @param {(req) => boolean | Promise<boolean>} [options.allowWithoutProfile]
 *        requêtes autorisées pour un utilisateur qui n'a PAS (encore) de fiche personnel
 *        dans cette boutique — uniquement les étapes d'activation et de rattachement.
 */
export function access({ read = ALL, write = ALL, licence = false, allowWithoutProfile } = {}) {
  return async (req, res, next) => {
    const person = await getCallerPersonnel(req);

    if (!person) {
      if (allowWithoutProfile && (await allowWithoutProfile(req))) return next();
      return deny(res, 403, "Ce compte n'a pas accès à cette boutique.", 'hors_boutique');
    }
    if (!person.actif) {
      return deny(res, 403, "Ce compte a été désactivé — contacte l'administrateur de la boutique.", 'compte_desactive');
    }
    req.callerPersonnel = person;

    const isRead = READ_METHODS.has(req.method);
    const roles = isRead ? read : write;
    if (!roles.includes(person.role)) {
      return deny(res, 403, "Ton rôle ne permet pas cette action.", 'role_insuffisant');
    }

    if (licence && !isRead && (await licenceExpired(req))) {
      return deny(
        res,
        402,
        "La licence de cette boutique a expiré — renouvelle-la pour continuer.",
        'licence_expiree'
      );
    }

    next();
  };
}
