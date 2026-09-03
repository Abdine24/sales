import { getSupabase, isSupabaseConfigured } from './supabase';

// Gestion des utilisateurs via Supabase Auth : inscription, connexion, réinitialisation
// de mot de passe. Les identifiants (email + mot de passe) et les sessions sont désormais
// gérés par Supabase — plus par un hash local dans Dexie. Le profil métier (nom, rôle,
// zone, licence...) continue de vivre localement (et plus tard sur le VPS), lié au compte
// Supabase via son user.id (voir Personnel.supabase_user_id dans db.ts).

export interface SupabaseAuthResult {
  success: boolean;
  message?: string;
  userId?: string;
  // false si Supabase exige une confirmation par email avant d'ouvrir une session
  // (aucune session immédiate après signUp dans ce cas).
  sessionActive?: boolean;
  // true uniquement si Supabase était injoignable (réseau, config) — PAS quand Supabase a
  // répondu et refusé explicitement (mauvais mot de passe, email non confirmé...). Sert à
  // savoir si un repli local est légitime (hors-ligne) ou dangereux (contourne un refus réel).
  networkError?: boolean;
}

const errorMessage = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

// URL de redirection pour les emails de réinitialisation — ramène l'utilisateur sur l'app avec
// un jeton de récupération dans l'URL (voir onAuthRecoveryEvent ci-dessous). Dans l'app
// desktop installée (Electron), window.location.origin vaut "file://..." — inutilisable pour
// un lien cliqué depuis un client mail (ouvrirait un fichier local dans le navigateur, jamais
// l'app installée). On utilise à la place un schéma d'URL personnalisé ("ivente://") que
// Windows/macOS/Linux savent renvoyer vers l'app installée (voir electron/main.cjs et
// src/services/electronDeepLink.ts) — à ajouter aux "Redirect URLs" autorisées du Dashboard
// Supabase pour que Supabase accepte d'y rediriger.
const getRedirectUrl = () => {
  if (typeof window !== 'undefined' && window.electronAPI?.isElectron) {
    return 'ivente://reset-password';
  }
  return `${window.location.origin}${window.location.pathname}`;
};

export async function signUpWithPassword(email: string, password: string): Promise<SupabaseAuthResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, message: 'Supabase n’est pas configuré (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquants).' };
  }
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { emailRedirectTo: getRedirectUrl() },
    });
    if (error) return { success: false, message: error.message };
    if (!data.user) return { success: false, message: 'Création du compte impossible.' };

    return {
      success: true,
      userId: data.user.id,
      sessionActive: Boolean(data.session),
      message: data.session
        ? undefined
        : 'Compte créé. Vérifie ta boîte mail pour confirmer ton adresse avant de te connecter.',
    };
  } catch (err) {
    return { success: false, message: errorMessage(err, "Échec de la création du compte.") };
  }
}

export async function signInWithPassword(email: string, password: string): Promise<SupabaseAuthResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, message: 'Supabase n’est pas configuré (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquants).' };
  }
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) return { success: false, message: error.message };
    if (!data.user) return { success: false, message: 'Identifiants incorrects.' };
    return { success: true, userId: data.user.id, sessionActive: Boolean(data.session) };
  } catch (err) {
    return { success: false, message: errorMessage(err, 'Erreur lors de la connexion.'), networkError: true };
  }
}

export async function signOutSupabase(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = await getSupabase();
    await supabase.auth.signOut();
  } catch {
    // La déconnexion locale (session Dexie) reste effective même si l'appel réseau échoue.
  }
}

export async function sendPasswordResetEmail(email: string): Promise<SupabaseAuthResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, message: 'Supabase n’est pas configuré.' };
  }
  try {
    const supabase = await getSupabase();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: getRedirectUrl(),
    });
    if (error) return { success: false, message: error.message };
    return { success: true, message: 'Si un compte existe avec cet email, un lien de réinitialisation vient d’être envoyé.' };
  } catch (err) {
    return { success: false, message: errorMessage(err, "Échec de l'envoi de l'email de réinitialisation.") };
  }
}

// À appeler depuis l'écran "nouveau mot de passe" affiché après le clic sur le lien reçu par
// email (une session de récupération temporaire est alors active côté Supabase).
export async function updateOwnPassword(newPassword: string): Promise<SupabaseAuthResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, message: 'Supabase n’est pas configuré.' };
  }
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { success: false, message: error.message };
    return { success: true, userId: data.user?.id };
  } catch (err) {
    return { success: false, message: errorMessage(err, 'Échec de la mise à jour du mot de passe.') };
  }
}

export async function getSupabaseUserEmail(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await getSupabase();
    const { data } = await supabase.auth.getUser();
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

// S'abonne aux changements de session Supabase. Utilisé pour détecter l'événement
// PASSWORD_RECOVERY (utilisateur revenu sur l'app via le lien de réinitialisation) et
// afficher automatiquement l'écran "nouveau mot de passe".
export async function subscribeToAuthEvents(
  onEvent: (event: string) => void
): Promise<() => void> {
  if (!isSupabaseConfigured()) return () => {};
  const supabase = await getSupabase();
  const { data } = supabase.auth.onAuthStateChange((event) => onEvent(event));
  return () => data.subscription.unsubscribe();
}
