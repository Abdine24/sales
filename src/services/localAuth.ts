import { Licence, Personnel, PersonnelRole } from '../db/db';
import { validateLicenseKey } from '../utils/license';
import { isSupabaseConfigured } from './supabase';
import { signInWithPassword, updateOwnPassword } from './supabaseAuth';
import { apiGet, apiPost, ApiError } from './api';

// SaaS mode: Auth is always required.
export const AUTH_REQUIRED = true;

// Résout le profil personnel (rôle, zone...) associé à l'utilisateur Supabase actuellement
// authentifié — le serveur est l'unique source de vérité (voir server/src/routes/personnel.js,
// route /me). Renvoie null si aucun profil n'existe encore pour ce compte (email pas encore
// rattaché par un admin) ou s'il est désactivé.
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
// Validée et écrite côté serveur (voir server/src/routes/licenceStatus.js).
export const renewLicence = async (cle: string): Promise<Licence> => {
  try {
    return await apiPost<Licence>('/licence/activer', { cle: cle.trim().toUpperCase() });
  } catch (err) {
    throw new Error(err instanceof ApiError ? err.message : 'Clé de licence invalide.');
  }
};

export const canAccess = (personnel: Pick<Personnel, 'role'>, page: string) => {
  if (personnel.role === 'admin') return true;
  if (personnel.role === 'gerant') return ['dashboard', 'pos', 'ventes', 'clients', 'stock'].includes(page);
  // Caissier a un accès très restreint — mais peut traiter un retour au comptoir
  return ['pos', 'ventes', 'clients'].includes(page);
};

// Ordre d'affichage des pages dans le menu — sert à choisir la page d'accueil selon le rôle
const PAGE_ORDER = ['dashboard', 'pos', 'ventes', 'stock', 'clients', 'fournisseurs', 'categories', 'personnel', 'settings'];

export const firstAllowedPage = (personnel: Pick<Personnel, 'role'>): string =>
  PAGE_ORDER.find((page) => canAccess(personnel, page)) ?? 'pos';

export const roleLabel = (role: PersonnelRole) => {
  if (role === 'admin') return 'Administrateur';
  if (role === 'caissier') return 'Caissier';
  return 'Gérant';
};
