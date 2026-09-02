import { db, Licence, Personnel, PersonnelRole } from '../db/db';
import { computeExpiryIso, validateLicenseKey } from '../utils/license';
import { isSupabaseConfigured } from './supabase';
import { signInWithPassword, signOutSupabase, updateOwnPassword, getSupabaseUserEmail } from './supabaseAuth';
import { apiGet, apiPost, ApiError } from './api';

const SESSION_KEY = 'vente_personnel_session';

// SaaS mode: Auth is always required.
export const AUTH_REQUIRED = true;

const toHex = (bytes: Uint8Array) => Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');

const hashPassword = async (password: string, salt: string) => {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return `${salt}:${toHex(new Uint8Array(digest))}`;
};

export const makePasswordHash = (password: string) => hashPassword(password, crypto.randomUUID());

export const generatePersonnelIdentifier = () => Array.from(crypto.getRandomValues(new Uint8Array(10)))
  .map((value) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[value % 32])
  .join('');

export const generateUniquePersonnelIdentifier = async () => {
  let identifiant = generatePersonnelIdentifier();
  while (await db.personnel.where('identifiant').equals(identifiant).count()) {
    identifiant = generatePersonnelIdentifier();
  }
  return identifiant;
};

const verifyPassword = async (password: string, storedHash: string) => {
  const [salt, expected] = storedHash.split(':');
  if (!salt || !expected) return false;
  const actual = (await hashPassword(password, salt)).split(':')[1];
  return actual === expected;
};

export const getSessionId = () => {
  const value = sessionStorage.getItem(SESSION_KEY);
  return value ? Number(value) : null;
};

export const setSession = (id: number) => sessionStorage.setItem(SESSION_KEY, String(id));
export const clearSession = () => sessionStorage.removeItem(SESSION_KEY);

// Résout le profil personnel (rôle, zone...) associé à l'utilisateur Supabase actuellement
// authentifié — le serveur est l'unique source de vérité désormais (voir
// server/src/routes/personnel.js, route /me). Renvoie null si aucun profil n'existe encore
// pour ce compte (email pas encore rattaché par un admin) ou s'il est désactivé.
const resolveCurrentPersonnel = async (): Promise<Personnel | null> => {
  try {
    const personnel = await apiGet<Personnel>('/personnel/me');
    if (!personnel.actif) return null;
    return personnel;
  } catch {
    return null;
  }
};

export const authenticate = async (_username: string, email: string, password: string) => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase doit être configuré pour se connecter.');
  }
  const normalizedEmail = email.trim().toLowerCase();
  const result = await signInWithPassword(normalizedEmail, password);
  if (!result.success) return null;
  return resolveCurrentPersonnel();
};

// Termine le parcours "mot de passe oublié" : appelé une fois que l'utilisateur a défini
// son nouveau mot de passe (session de récupération Supabase active), résout son profil
// via le serveur et ouvre sa session applicative.
export const completePasswordReset = async (newPassword: string): Promise<Personnel | null> => {
  const result = await updateOwnPassword(newPassword);
  if (!result.success) {
    throw new Error(result.message || 'Échec de la mise à jour du mot de passe.');
  }
  return resolveCurrentPersonnel();
};

export const createPrincipal = async (nom: string, username: string, email: string, password: string, cle: string) => {
  const validation = await validateLicenseKey(cle);
  if (!validation.valid) {
    throw new Error(validation.reason || 'Clé de licence invalide.');
  }

  if (!isSupabaseConfigured()) {
    throw new Error('Supabase doit être configuré pour activer une boutique.');
  }
  const normalizedUsername = username.trim().toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();

  // À ce stade l'email a déjà été vérifié par OTP (voir AuthGate), ce qui a ouvert une
  // session Supabase pour cet utilisateur : on y attache simplement le mot de passe choisi
  // plutôt que de re-créer un compte (qui entrerait en conflit avec celui de l'OTP).
  const passwordResult = await updateOwnPassword(password);
  if (!passwordResult.success) {
    throw new Error(passwordResult.message || "Échec de l'enregistrement du mot de passe.");
  }

  // Active la licence de la boutique (revalidée et écrite côté serveur).
  await apiPost('/licence/activer', { cle: cle.trim().toUpperCase() });

  // Crée le profil admin/principal, lié dès sa création au compte Supabase qu'on vient d'activer.
  await apiPost('/personnel', {
    nom: nom.trim(),
    username: normalizedUsername,
    email: normalizedEmail,
    role: 'admin',
    actif: true,
    principal: true,
    supabase_user_id: passwordResult.userId,
  });

  return resolveCurrentPersonnel();
};

// Active/renouvelle la licence de la boutique avec une nouvelle clé. La période repart
// de la date du renouvellement (pas de cumul avec le temps restant de l'ancienne clé).
// La validation ET l'écriture se font désormais côté serveur (voir server/src/routes/licenceStatus.js) —
// c'est lui la source de vérité, plus Dexie.
export const renewLicence = async (cle: string): Promise<Licence> => {
  try {
    return await apiPost<Licence>('/licence/activer', { cle: cle.trim().toUpperCase() });
  } catch (err) {
    throw new Error(err instanceof ApiError ? err.message : 'Clé de licence invalide.');
  }
};

export const hasPrincipal = async () => (await db.personnel.toArray()).some((personnel) => personnel.principal);
export const hasLicence = async () => Boolean(await db.licence.get('principale'));

export const canAccess = (personnel: Pick<Personnel, 'role'>, page: string) => {
  if (personnel.role === 'admin') return true;
  if (personnel.role === 'gerant') return ['dashboard', 'pos', 'ventes', 'clients', 'stock'].includes(page);
  // Caissier a un accès très restreint — mais peut traiter un retour au comptoir
  return ['pos', 'ventes', 'clients'].includes(page);
};

// Ordre d'affichage des pages dans le menu — sert à choisir la page d'accueil selon le rôle
const PAGE_ORDER = ['dashboard', 'pos', 'ventes', 'stock', 'clients', 'fournisseurs', 'categories', 'personnel', 'settings', 'sync'];

export const firstAllowedPage = (personnel: Pick<Personnel, 'role'>): string =>
  PAGE_ORDER.find((page) => canAccess(personnel, page)) ?? 'pos';

export const roleLabel = (role: PersonnelRole) => {
  if (role === 'admin') return 'Administrateur';
  if (role === 'caissier') return 'Caissier';
  return 'Gérant';
};

// Réinitialise tous les utilisateurs et mots de passe avec des comptes par défaut
export const resetAllUsersAndPasswords = async () => {
  await db.personnel.clear();

  const activeeLe = new Date().toISOString();
  // S'assurer qu'une licence valide (365 jours) existe
  const licence: Licence = {
    id: 'principale',
    cle: 'IVTE-0365-W8CPRHL3-1BE5B4C8',
    activee_le: activeeLe,
    duree_jours: 365,
    expire_le: computeExpiryIso(activeeLe, 365),
  };
  await db.licence.put(licence);

  // 1. Administrateur
  const adminHash = await makePasswordHash('admin123');
  const admin: Personnel = {
    identifiant: await generateUniquePersonnelIdentifier(),
    nom: 'Administrateur',
    username: 'admin',
    email: 'admin@ivente.com',
    password_hash: adminHash,
    role: 'admin',
    actif: true,
    principal: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // 2. Gérant
  const gerantHash = await makePasswordHash('gerant123');
  const gerant: Personnel = {
    identifiant: await generateUniquePersonnelIdentifier(),
    nom: 'Gérant Magasin',
    username: 'gerant',
    email: 'gerant@ivente.com',
    password_hash: gerantHash,
    role: 'gerant',
    actif: true,
    principal: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // 3. Caissier
  const caissierHash = await makePasswordHash('caissier123');
  const caissier: Personnel = {
    identifiant: await generateUniquePersonnelIdentifier(),
    nom: 'Caissier Principal',
    username: 'caissier',
    email: 'caissier@ivente.com',
    password_hash: caissierHash,
    role: 'caissier',
    actif: true,
    principal: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await db.personnel.bulkAdd([admin, gerant, caissier]);
  return admin;
};

// S'assure qu'au moins un compte administrateur existe au démarrage
export const ensureDefaultPersonnel = async () => {
  const count = await db.personnel.count();
  if (count === 0) {
    return resetAllUsersAndPasswords();
  }
};
