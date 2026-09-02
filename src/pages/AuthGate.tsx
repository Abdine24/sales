import React, { useState, useEffect } from 'react';
import {
  KeyRound,
  LockKeyhole,
  LogIn,
  UserPlus,
  Mail,
  User,
  ShieldCheck,
  ArrowLeft,
  RotateCw,
  CheckCircle2,
  Sparkles,
  Send,
  ShieldAlert,
} from 'lucide-react';
import {
  authenticate,
  createPrincipal,
  completePasswordReset,
  resetAllUsersAndPasswords,
  ensureDefaultPersonnel,
} from '../services/localAuth';
import { sendEmailOtp, verifyEmailOtp } from '../services/authService';
import { sendPasswordResetEmail, subscribeToAuthEvents } from '../services/supabaseAuth';
import { validateLicenseKey, requestTrialLicenseKey } from '../utils/license';
import { Button } from '../components/ui/Button';
import { useAuth } from '../hooks/useAuth';

type AuthMode = 'login' | 'activation' | 'forgot-password' | 'reset-password';

export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { personnel, setPersonnel } = useAuth();

  const [mode, setMode] = useState<AuthMode>('login');
  const [activationStep, setActivationStep] = useState<'form' | 'otp'>('form');

  // Form Fields
  const [nom, setNom] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cle, setCle] = useState('');

  // OTP Fields
  const [otpCode, setOtpCode] = useState('');
  const [isSimulatedOtp, setIsSimulatedOtp] = useState(false);
  const [simulatedCode, setSimulatedCode] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  // Mot de passe oublié
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  // Nouveau mot de passe (après clic sur le lien reçu par email)
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');

  // Status
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  // Cooldown countdown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Quand l'utilisateur revient sur l'app via le lien "réinitialiser mon mot de passe"
  // reçu par email, Supabase ouvre une session de récupération et émet cet événement.
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    subscribeToAuthEvents((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setError('');
        setInfoMessage('');
        setMode('reset-password');
      }
    }).then((unsub) => {
      unsubscribe = unsub;
    });
    return () => unsubscribe?.();
  }, []);

  // Initialisation automatique de comptes de démo — UNIQUEMENT en développement local
  // (npm run dev). Retiré du build de production : sur l'app publique, aucun compte
  // admin ne doit pouvoir être créé sans passer par la licence + vérification d'email.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    ensureDefaultPersonnel().then(() => {
      setUsername((prev) => prev || 'admin');
      setEmail((prev) => prev || 'admin@ivente.com');
      setPassword((prev) => prev || 'admin123');
    }).catch(console.error);
  }, []);

  const handleResetAll = async () => {
    setLoading(true);
    setError('');
    try {
      await resetAllUsersAndPasswords();
      setUsername('admin');
      setEmail('admin@ivente.com');
      setPassword('admin123');
      setInfoMessage('Tous les comptes ont été réinitialisés avec succès ! (admin / admin123)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la réinitialisation.');
    } finally {
      setLoading(false);
    }
  };

  // Activation directe sans vérification OTP — outil de dépannage DEV UNIQUEMENT (ex: quota
  // d'emails Supabase épuisé pendant les tests). Ne doit jamais être accessible en production :
  // ça reviendrait à distribuer des comptes admin + licences d'essai sans aucun contrôle.
  const handleDirectActivation = async () => {
    if (!import.meta.env.DEV) return;
    setLoading(true);
    setError('');
    try {
      const trialCle = cle.trim() ? cle : await requestTrialLicenseKey();
      const created = await createPrincipal(
        nom.trim() || 'Admin',
        username.trim() || 'admin',
        email.trim() || 'admin@ivente.com',
        password || 'admin123',
        trialCle
      );
      if (!created) throw new Error('Création impossible.');
      setPersonnel(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'activation directe.");
    } finally {
      setLoading(false);
    }
  };

  if (personnel) {
    return <>{children}</>;
  }

  // Envoi de l'email de réinitialisation de mot de passe
  const handleSendResetEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await sendPasswordResetEmail(forgotEmail);
      if (!result.success) {
        throw new Error(result.message || "Échec de l'envoi de l'email.");
      }
      setForgotSent(true);
      setInfoMessage(result.message || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'envoi de l'email de réinitialisation.");
    } finally {
      setLoading(false);
    }
  };

  // Validation du nouveau mot de passe, puis ouverture de session
  const handleSubmitNewPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (newPassword.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    try {
      const loggedIn = await completePasswordReset(newPassword);
      if (!loggedIn) {
        throw new Error(
          'Mot de passe mis à jour, mais aucun profil local ne correspond à cet email. Contacte l’administrateur.'
        );
      }
      setPersonnel(loggedIn);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la mise à jour du mot de passe.');
    } finally {
      setLoading(false);
    }
  };

  // 1. Soumission du formulaire d'activation (Vérification licence + Envoi du code OTP)
  const handleInitiateActivation = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setInfoMessage('');

    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Veuillez saisir une adresse email valide.');
      return;
    }

    setLoading(true);
    try {
      // Validation préalable de la licence
      const licenseCheck = await validateLicenseKey(cle);
      if (!licenseCheck.valid) {
        throw new Error(licenseCheck.reason || 'Clé de licence invalide.');
      }

      // Envoi de l'OTP par email (via Supabase ou simulation locale)
      const res = await sendEmailOtp(cleanEmail);
      if (!res.success) {
        throw new Error(res.message);
      }

      setIsSimulatedOtp(Boolean(res.isSimulated));
      setSimulatedCode(res.simulatedCode || '');
      setInfoMessage(res.message);
      setResendCooldown(60);
      setActivationStep('otp');
      setOtpCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de poursuivre l’activation.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Renvoi du code OTP
  const handleResendOtp = async () => {
    if (resendCooldown > 0 || loading) return;
    setError('');
    setLoading(true);
    try {
      const res = await sendEmailOtp(email.trim().toLowerCase());
      if (!res.success) {
        throw new Error(res.message);
      }
      setIsSimulatedOtp(Boolean(res.isSimulated));
      setSimulatedCode(res.simulatedCode || '');
      setInfoMessage(`Nouveau code envoyé à ${email}.`);
      setResendCooldown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec du renvoi du code.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Validation de l'OTP & Création définitive du compte Admin
  const handleVerifyOtpAndCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    const cleanOtp = otpCode.trim().replace(/\s+/g, '');
    if (cleanOtp.length < 6) {
      setError('Veuillez saisir les 6 chiffres du code reçu par email.');
      return;
    }

    setLoading(true);
    try {
      // Vérification OTP Supabase
      const verifyRes = await verifyEmailOtp(email, cleanOtp);
      if (!verifyRes.success) {
        throw new Error(verifyRes.message || 'Code de vérification invalide.');
      }

      // Création du compte administrateur et activation de la licence
      const created = await createPrincipal(nom, username, email, password, cle);
      if (!created) throw new Error('Création impossible du compte admin.');

      setPersonnel(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la validation du compte.');
    } finally {
      setLoading(false);
    }
  };

  // 4. Connexion standard
  const submitLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const loggedIn = await authenticate(username, email, password);
      if (!loggedIn) {
        setError('Identifiants incorrects (vérifiez le nom d’utilisateur, l’email et le mot de passe).');
        return;
      }
      setPersonnel(loggedIn);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la connexion.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col items-center justify-center p-6 relative">
      <div className="w-full max-w-md glass-card p-8 rounded-3xl relative overflow-hidden shadow-2xl border border-slate-200/80 dark:border-white/10">
        {/* Header */}
        <div className="flex items-center gap-3.5 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/30 shrink-0">
            {mode === 'forgot-password' || mode === 'reset-password' ? (
              <ShieldAlert className="w-6 h-6" />
            ) : mode === 'activation' && activationStep === 'otp' ? (
              <ShieldCheck className="w-6 h-6" />
            ) : (
              <LockKeyhole className="w-6 h-6" />
            )}
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">iVente</h1>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
              {mode === 'login'
                ? 'Connexion sécurisée'
                : mode === 'forgot-password'
                ? 'Mot de passe oublié'
                : mode === 'reset-password'
                ? 'Nouveau mot de passe'
                : activationStep === 'otp'
                ? 'Vérification de l’email'
                : 'Activation de la boutique'}
            </p>
          </div>
        </div>

        {/* STEP 1: LOGIN */}
        {mode === 'login' && (
          <form onSubmit={submitLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Nom d’utilisateur
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <input
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ex: admin, moussa, fatou"
                  className="w-full glass-input pl-10 pr-4 py-3 rounded-xl text-sm text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Adresse Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@domaine.com"
                  className="w-full glass-input pl-10 pr-4 py-3 rounded-xl text-sm text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Mot de passe
              </label>
              <div className="relative">
                <LockKeyhole className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <input
                  required
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mot de passe"
                  className="w-full glass-input pl-10 pr-4 py-3 rounded-xl text-sm text-slate-900 dark:text-white"
                />
              </div>
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setInfoMessage('');
                    setForgotEmail(email);
                    setForgotSent(false);
                    setMode('forgot-password');
                  }}
                  className="text-[11px] font-semibold text-blue-500 hover:text-blue-600 transition-colors"
                >
                  Mot de passe oublié ?
                </button>
              </div>
            </div>

            {/* Comptes pré-configurés et réinitialisation — DEV UNIQUEMENT. Ce bloc ne doit
                jamais apparaître sur l'app publique (ça reviendrait à afficher des identifiants
                admin en clair sur l'écran de connexion). Retiré du build de production. */}
            {import.meta.env.DEV && (
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-white/5 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <span>Comptes prêts à l'emploi (dev)</span>
                  <button
                    type="button"
                    onClick={handleResetAll}
                    className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-semibold normal-case"
                    title="Réinitialiser tous les mots de passe et utilisateurs"
                  >
                    <RotateCw className="w-3 h-3" />
                    Réinitialiser
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setUsername('admin');
                      setEmail('admin@ivente.com');
                      setPassword('admin123');
                      setError('');
                    }}
                    className="p-2 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-bold text-center transition active:scale-95"
                  >
                    Admin
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUsername('gerant');
                      setEmail('gerant@ivente.com');
                      setPassword('gerant123');
                      setError('');
                    }}
                    className="p-2 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 text-xs font-bold text-center transition active:scale-95"
                  >
                    Gérant
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUsername('caissier');
                      setEmail('caissier@ivente.com');
                      setPassword('caissier123');
                      setError('');
                    }}
                    className="p-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold text-center transition active:scale-95"
                  >
                    Caissier
                  </button>
                </div>
              </div>
            )}

            {infoMessage && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                {infoMessage}
              </div>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold">
                {error}
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full mt-2"
              disabled={loading}
              icon={<LogIn className="w-4 h-4" />}
            >
              {loading ? 'Connexion en cours...' : 'Se connecter'}
            </Button>
          </form>
        )}

        {/* MOT DE PASSE OUBLIÉ */}
        {mode === 'forgot-password' && (
          <div className="space-y-5">
            {forgotSent ? (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {infoMessage || 'Email de réinitialisation envoyé.'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ouvre le lien reçu par email pour choisir un nouveau mot de passe.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSendResetEmail} className="space-y-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Saisis l'adresse email de ton compte : tu recevras un lien pour choisir un nouveau mot de passe.
                </p>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Adresse Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                    <input
                      required
                      autoFocus
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="email@domaine.com"
                      className="w-full glass-input pl-10 pr-4 py-3 rounded-xl text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                {error && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full mt-2"
                  disabled={loading}
                  icon={<Send className="w-4 h-4" />}
                >
                  {loading ? 'Envoi en cours...' : 'Envoyer le lien de réinitialisation'}
                </Button>
              </form>
            )}
          </div>
        )}

        {/* NOUVEAU MOT DE PASSE (après clic sur le lien reçu par email) */}
        {mode === 'reset-password' && (
          <form onSubmit={handleSubmitNewPassword} className="space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Choisis un nouveau mot de passe pour ton compte.
            </p>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Nouveau mot de passe
              </label>
              <div className="relative">
                <LockKeyhole className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <input
                  required
                  autoFocus
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Au moins 6 caractères"
                  className="w-full glass-input pl-10 pr-4 py-3 rounded-xl text-sm text-slate-900 dark:text-white"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Confirmer le mot de passe
              </label>
              <div className="relative">
                <LockKeyhole className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <input
                  required
                  type="password"
                  value={newPasswordConfirm}
                  onChange={(e) => setNewPasswordConfirm(e.target.value)}
                  placeholder="Ressaisir le mot de passe"
                  className="w-full glass-input pl-10 pr-4 py-3 rounded-xl text-sm text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold">
                {error}
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full mt-2"
              disabled={loading}
              icon={<CheckCircle2 className="w-4 h-4" />}
            >
              {loading ? 'Mise à jour...' : 'Valider le nouveau mot de passe'}
            </Button>
          </form>
        )}

        {/* STEP 2: ACTIVATION FORM */}
        {mode === 'activation' && activationStep === 'form' && (
          <form onSubmit={handleInitiateActivation} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Nom complet de l'Admin
              </label>
              <div className="relative">
                <ShieldCheck className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <input
                  required
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder="ex: Jean Dupont"
                  className="w-full glass-input pl-10 pr-4 py-3 rounded-xl text-sm text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Nom d’utilisateur
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <input
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ex: admin"
                  className="w-full glass-input pl-10 pr-4 py-3 rounded-xl text-sm text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Adresse Email (pour recevoir le code OTP)
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@domaine.com"
                  className="w-full glass-input pl-10 pr-4 py-3 rounded-xl text-sm text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Mot de passe
              </label>
              <div className="relative">
                <LockKeyhole className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <input
                  required
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Au moins 6 caractères"
                  className="w-full glass-input pl-10 pr-4 py-3 rounded-xl text-sm text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Clé de Licence Logicielle
                </label>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const trialKey = await requestTrialLicenseKey();
                      setCle(trialKey);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Impossible de générer une clé d'essai pour le moment.");
                    }
                  }}
                  className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1 transition"
                  title="Générer et appliquer la clé d'essai 7 jours"
                >
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  Essai gratuit (7 jours)
                </button>
              </div>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <input
                  required
                  value={cle}
                  onChange={(e) => setCle(e.target.value)}
                  placeholder="ex: IVTE-0365-XXXXXXXX-XXXXXXXX"
                  className="w-full glass-input pl-10 pr-28 py-3 rounded-xl text-sm text-slate-900 dark:text-white font-mono uppercase"
                />
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const trialKey = await requestTrialLicenseKey();
                      setCle(trialKey);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Impossible de générer une clé d'essai pour le moment.");
                    }
                  }}
                  className="absolute right-1.5 top-1.5 bottom-1.5 px-3 bg-blue-600/10 hover:bg-blue-600/20 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shadow-sm"
                  title="Remplir avec une clé d'essai 7 jours"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Essai 7j</span>
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold space-y-2.5">
                <div>{error}</div>
                {import.meta.env.DEV &&
                  (error.toLowerCase().includes('rate limit') || error.toLowerCase().includes('limit')) && (
                  <button
                    type="button"
                    onClick={handleDirectActivation}
                    className="w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition shadow-md shadow-blue-500/20 active:scale-95"
                  >
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>Activer directement en local (dev uniquement)</span>
                  </button>
                )}
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full mt-2"
              disabled={loading}
              icon={<UserPlus className="w-4 h-4" />}
            >
              {loading ? 'Vérification et envoi du code...' : 'Recevoir mon code par email'}
            </Button>
          </form>
        )}

        {/* STEP 3: OTP VERIFICATION STEP */}
        {mode === 'activation' && activationStep === 'otp' && (
          <form onSubmit={handleVerifyOtpAndCreate} className="space-y-5">
            <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/40 text-center">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto mb-2">
                <Mail className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Un code de vérification à 6 chiffres a été envoyé à :
              </p>
              <p className="text-sm font-bold text-blue-600 dark:text-blue-400 font-mono mt-0.5 truncate">
                {email}
              </p>
            </div>

            {isSimulatedOtp && simulatedCode && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>Mode Test / Supabase non relié :</span>
                </div>
                <button
                  type="button"
                  onClick={() => setOtpCode(simulatedCode)}
                  className="font-mono font-black text-sm px-2 py-0.5 bg-amber-500 text-white rounded hover:bg-amber-600 transition"
                  title="Cliquer pour insérer"
                >
                  {simulatedCode}
                </button>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block text-center">
                Saisissez le Code OTP (6 chiffres)
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                required
                autoFocus
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="• • • • • •"
                className="w-full text-center tracking-[0.6em] text-2xl font-black font-mono glass-input py-3.5 rounded-2xl text-slate-900 dark:text-white"
              />
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold text-center">
                {error}
              </div>
            )}

            {infoMessage && !error && (
              <div className="text-[11px] text-center text-emerald-600 dark:text-emerald-400 font-medium">
                {infoMessage}
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={loading || otpCode.length < 6}
              icon={<CheckCircle2 className="w-4 h-4" />}
            >
              {loading ? 'Validation en cours...' : 'Valider & Activer ma boutique'}
            </Button>

            <div className="flex items-center justify-between text-xs pt-1">
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setActivationStep('form');
                }}
                className="text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Modifier mes infos
              </button>

              <button
                type="button"
                onClick={handleResendOtp}
                disabled={resendCooldown > 0 || loading}
                className="text-blue-600 dark:text-blue-400 font-semibold disabled:text-slate-400 flex items-center gap-1 hover:underline transition"
              >
                <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                {resendCooldown > 0 ? `Renvoyer (${resendCooldown}s)` : 'Renvoyer le code'}
              </button>
            </div>
          </form>
        )}

        {/* Footer Navigation */}
        <div className="mt-6 text-center border-t border-slate-200/50 dark:border-white/5 pt-4">
          {mode === 'login' ? (
            <button
              type="button"
              onClick={() => {
                setError('');
                setActivationStep('form');
                setMode('activation');
              }}
              className="text-xs font-semibold text-slate-400 hover:text-blue-500 transition-colors flex items-center justify-center gap-1.5 mx-auto"
            >
              <KeyRound className="w-3.5 h-3.5" />
              Activer une nouvelle licence
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setError('');
                setActivationStep('form');
                setMode('login');
              }}
              className="text-xs font-semibold text-slate-400 hover:text-blue-500 transition-colors flex items-center justify-center gap-1.5 mx-auto"
            >
              <LogIn className="w-3.5 h-3.5" />
              Retour à la connexion
            </button>
          )}
        </div>
      </div>
    </div>
  );
};