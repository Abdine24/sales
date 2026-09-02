import { getSupabase, isSupabaseConfigured } from './supabase';

export interface SendOtpResult {
  success: boolean;
  message: string;
  isSimulated?: boolean;
  simulatedCode?: string;
}

export interface VerifyOtpResult {
  success: boolean;
  message?: string;
}

// Mémoire temporaire pour la simulation locale / hors-ligne si Supabase n'est pas encore branché
let simulatedOtpStore: { email: string; code: string; expiresAt: number } | null = null;

/**
 * Envoie un code OTP à 6 chiffres par email via Supabase Auth (ou simulation locale si non configuré)
 */
export async function sendEmailOtp(email: string): Promise<SendOtpResult> {
  const cleanEmail = email.trim().toLowerCase();

  if (isSupabaseConfigured()) {
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          shouldCreateUser: true,
        },
      });

      if (error) {
        return { success: false, message: error.message };
      }

      return {
        success: true,
        message: `Un code de sécurité à 6 chiffres a été envoyé à ${cleanEmail}.`,
        isSimulated: false,
      };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : "Échec de l'envoi du code par email.",
      };
    }
  }

  // Mode de secours / simulation pour le développement
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  simulatedOtpStore = {
    email: cleanEmail,
    code,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
  };

  return {
    success: true,
    message: `Code OTP généré pour ${cleanEmail}`,
    isSimulated: true,
    simulatedCode: code,
  };
}

/**
 * Vérifie le code OTP saisi par l'administrateur
 */
export async function verifyEmailOtp(email: string, token: string): Promise<VerifyOtpResult> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanToken = token.trim().replace(/\s+/g, '');

  if (!cleanToken) {
    return { success: false, message: 'Veuillez saisir le code OTP reçu par email.' };
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: cleanToken,
        type: 'email',
      });

      if (error) {
        return {
          success: false,
          message: error.message || 'Code de vérification invalide ou expiré.',
        };
      }

      return { success: true };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Erreur lors de la vérification du code.',
      };
    }
  }

  // Vérification en mode simulation
  if (
    simulatedOtpStore &&
    simulatedOtpStore.email === cleanEmail &&
    simulatedOtpStore.expiresAt > Date.now()
  ) {
    if (simulatedOtpStore.code === cleanToken || cleanToken === '123456') {
      simulatedOtpStore = null;
      return { success: true };
    }
    return { success: false, message: 'Code OTP incorrect. Veuillez réessayer.' };
  }

  // Code universel de test local
  if (cleanToken === '123456') {
    return { success: true };
  }

  return { success: false, message: 'Code de vérification expiré ou introuvable. Demandez un nouveau code.' };
}
