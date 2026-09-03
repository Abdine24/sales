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
  Eye,
  EyeOff,
  Store,
} from 'lucide-react';
import { authenticate, createPrincipal, completePasswordReset } from '../services/localAuth';
import { sendEmailOtp, verifyEmailOtp } from '../services/authService';
import { sendPasswordResetEmail, subscribeToAuthEvents } from '../services/supabaseAuth';
import { validateLicenseKey, requestTrialLicenseKey } from '../utils/license';
import { apiPostPublic } from '../services/api';
import { isPlatformLandingHost, buildBoutiqueUrl } from '../services/tenant';
import { Button } from '../components/ui/Button';
import { useAuth } from '../hooks/useAuth';

type AuthMode = 'create-boutique' | 'login' | 'activation' | 'forgot-password' | 'reset-password';

// Dérive une adresse de boutique valable (voir SLUG_RE côté serveur, tenantResolver.js)
// depuis le nom saisi — l'utilisateur peut ensuite l'ajuster librement.
const slugify = (nom: string) =>
  nom
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // accents (é -> e, etc.)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 31);

// Champ mot de passe avec bouton afficher/masquer — évite les erreurs de saisie silencieuses
// (fautes de frappe, mauvaise touche, clavier différent) qui ont causé plusieurs blocages de
// compte pendant les tests de ce site.
const PasswordField: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}> = ({ value, onChange, placeholder, autoFocus }) => {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <LockKeyhole className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
      <input
        required
        autoFocus={autoFocus}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full glass-input pl-10 pr-10 py-3 rounded-xl text-sm text-slate-900 dark:text-white"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((prev) => !prev)}
        className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        title={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
};

export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { personnel, setPersonnel } = useAuth();

  // Détecte un lien "réinitialiser mon mot de passe" dès le tout premier rendu, en lisant
  // directement l'URL (hash ou query selon le flux) plutôt que d'attendre l'événement
  // PASSWORD_RECOVERY de Supabase : ce dernier peut être émis avant que ce composant ait eu
  // le temps de s'abonner (AuthProvider vérifie déjà la session plus haut dans l'arbre), auquel
  // cas il est perdu et on retombe silencieusement sur l'écran de connexion normal.
  const isPasswordRecoveryLink = () =>
    typeof window !== 'undefined' &&
    (window.location.hash.includes('type=recovery') || window.location.search.includes('type=recovery'));

  const [mode, setMode] = useState<AuthMode>(() => {
    if (isPasswordRecoveryLink()) return 'reset-password';
    // Uniquement sur le domaine vitrine de la plateforme (azanga.tech / app.azanga.tech) :
    // c'est le tout premier écran, pas le portail de connexion d'une boutique précise (voir
    // services/tenant.ts). Tout autre hôte non reconnu — y compris l'ancienne adresse GitHub
    // Pages pendant la bascule — affiche la connexion normale, sans perturber les
    // utilisateurs déjà habitués à cette adresse.
    if (isPlatformLandingHost()) return 'create-boutique';
    return 'login';
  });
  const [activationStep, setActivationStep] = useState<'form' | 'otp'>('form');

  // Création de boutique (self-service, avant même qu'une boutique n'existe)
  const [boutiqueNom, setBoutiqueNom] = useState('');
  const [boutiqueSlug, setBoutiqueSlug] = useState('');
  const [slugEditedManually, setSlugEditedManually] = useState(false);

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

  // NB : les anciens raccourcis dev (comptes de démo pré-remplis, activation sans OTP) ont
  // été retirés — depuis que l'auth passe entièrement par Supabase (plus de repli Dexie),
  // ils créaient des comptes fantômes qui ne pouvaient plus jamais se connecter (l'activation
  // sans OTP en particulier : createPrincipal() a besoin d'une session Supabase déjà ouverte
  // par l'OTP pour attacher le mot de passe, donc la sauter cassait tout). Pour tester
  // rapidement : connecte-toi avec un vrai compte admin, puis crée des comptes de test via
  // Personnel.tsx (mot de passe choisi par toi, compte réel immédiatement utilisable).

  if (personnel) {
    return <>{children}</>;
  }

  // 0. Création d'une nouvelle boutique (self-service) — provisionne une base dédiée côté
  // serveur puis redirige vers le sous-domaine fraîchement créé, où l'écran d'activation
  // habituel (licence + OTP + bootstrap admin) prend le relais sans aucune adaptation.
  const handleCreateBoutique = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await apiPostPublic<{ slug: string; nom: string }>('/boutiques', {
        nom: boutiqueNom.trim(),
        slug: boutiqueSlug.trim().toLowerCase(),
      });
      window.location.href = buildBoutiqueUrl(result.slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de créer la boutique pour le moment.');
      setLoading(false);
    }
  };

  // Envoi de l'email de réinitialisation de mot de passe
  const handleSendResetEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      // L'admin gère les mots de passe de son équipe (voir Personnel.tsx) : un membre qui a
      // oublié le sien ne reçoit pas d'email de réinitialisation, ça notifie l'admin à la
      // place. Un email inconnu de notre base ne déclenche rien du tout — jamais d'appel à
      // Supabase pour une adresse qu'on ne reconnaît pas. Seul un compte admin connu passe
      // par l'email Supabase classique.
      const routing = await apiPostPublic<{ isAdmin: boolean; sendEmail: boolean }>(
        '/mot-de-passe-oublie',
        { email: forgotEmail }
      );

      if (routing.sendEmail) {
        const result = await sendPasswordResetEmail(forgotEmail);
        if (!result.success) {
          throw new Error(result.message || "Échec de l'envoi de l'email.");
        }
        setForgotSent(true);
        setInfoMessage(result.message || '');
      } else {
        // Email inconnu ou membre de l'équipe : même message dans les deux cas — on ne
        // révèle jamais si l'adresse correspond à un compte existant, mais on donne une
        // instruction claire et actionnable plutôt qu'un message vague.
        setForgotSent(true);
        setInfoMessage("Ce compte n'a pas de réinitialisation par email. Contacte l'administrateur principal de ta boutique pour obtenir un nouveau mot de passe.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'envoi de la demande de réinitialisation.");
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
            {mode === 'create-boutique' ? (
              <Store className="w-6 h-6" />
            ) : mode === 'forgot-password' || mode === 'reset-password' ? (
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
              {mode === 'create-boutique'
                ? 'Créer ma boutique'
                : mode === 'login'
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

        {/* STEP 0 : CRÉATION DE BOUTIQUE (self-service, avant que quoi que ce soit n'existe) */}
        {mode === 'create-boutique' && (
          <form onSubmit={handleCreateBoutique} className="space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Donne un nom à ta boutique — ça devient aussi l'adresse à laquelle ton équipe s'y connectera.
            </p>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Nom de la boutique
              </label>
              <div className="relative">
                <Store className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <input
                  required
                  autoFocus
                  value={boutiqueNom}
                  onChange={(e) => {
                    const value = e.target.value;
                    setBoutiqueNom(value);
                    if (!slugEditedManually) setBoutiqueSlug(slugify(value));
                  }}
                  placeholder="ex: Boutique Fatou"
                  className="w-full glass-input pl-10 pr-4 py-3 rounded-xl text-sm text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Adresse de la boutique
              </label>
              <div className="relative">
                <input
                  required
                  pattern="[a-z][a-z0-9-]{2,30}"
                  title="Lettres minuscules, chiffres et tirets uniquement, doit commencer par une lettre."
                  value={boutiqueSlug}
                  onChange={(e) => {
                    setSlugEditedManually(true);
                    setBoutiqueSlug(e.target.value.toLowerCase());
                  }}
                  placeholder="boutique-fatou"
                  className="w-full glass-input pl-4 pr-36 py-3 rounded-xl text-sm text-slate-900 dark:text-white font-mono"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 pointer-events-none">
                  .azanga.tech
                </span>
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
              icon={<Store className="w-4 h-4" />}
            >
              {loading ? 'Création en cours...' : 'Créer ma boutique'}
            </Button>
          </form>
        )}

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
              <PasswordField value={password} onChange={setPassword} placeholder="Mot de passe" />
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
              <PasswordField value={newPassword} onChange={setNewPassword} placeholder="Au moins 6 caractères" autoFocus />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Confirmer le mot de passe
              </label>
              <PasswordField value={newPasswordConfirm} onChange={setNewPasswordConfirm} placeholder="Ressaisir le mot de passe" />
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
              <PasswordField value={password} onChange={setPassword} placeholder="Au moins 6 caractères" />
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
                {(error.toLowerCase().includes('rate limit') || error.toLowerCase().includes('limit')) && (
                  <p className="text-[11px] font-normal text-rose-500/90">
                    Limite d'envoi d'emails Supabase atteinte — réessaie dans une heure, ou configure un SMTP personnalisé (voir la doc du projet).
                  </p>
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
                Saisissez le Code OTP reçu par email
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                // Pas de longueur fixe : Supabase ne garantit pas toujours 6 chiffres pile
                // selon la config du template email (voir {{ .Token }}) — mieux vaut accepter
                // une plage large que de tronquer silencieusement un vrai code plus long.
                maxLength={12}
                required
                autoFocus
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="• • • • • •"
                className="w-full text-center tracking-[0.4em] text-2xl font-black font-mono glass-input py-3.5 rounded-2xl text-slate-900 dark:text-white"
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

        {/* Footer Navigation — rien à proposer ici sur l'écran de création de boutique : il
            n'y a encore ni licence à activer ni compte auquel se connecter. */}
        {mode !== 'create-boutique' && (
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
        )}
      </div>
    </div>
  );
};