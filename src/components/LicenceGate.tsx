import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, KeyRound, ShieldAlert, Sparkles, X } from 'lucide-react';
import type { Licence } from '../db/db';
import { apiGet, ApiError } from '../services/api';
import { evaluateLicenceStatus, requestTrialLicenseKey } from '../utils/license';
import { renewLicence } from '../services/localAuth';
import { useAuth } from '../hooks/useAuth';
import { Button } from './ui/Button';

// Bloque l'accès à l'app si la licence de la boutique est absente ou expirée. Rendu à
// l'intérieur d'AuthGate : arriver jusqu'ici suppose déjà une session valide, donc pas besoin
// de re-vérifier si le compte admin existe (AuthGate s'en est déjà chargé).
export const LicenceGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { personnel } = useAuth();
  const [licence, setLicence] = useState<Licence | null | undefined>(undefined);
  const [cle, setCle] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Bannière d'expiration imminente masquée pour le reste de la session une fois fermée —
  // pas besoin de la re-proposer à chaque clic dans l'app, juste à chaque nouvelle ouverture.
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const reloadLicence = useCallback(async () => {
    try {
      setLicence(await apiGet<Licence | null>('/licence'));
    } catch {
      setLicence(null);
    }
  }, []);

  useEffect(() => {
    reloadLicence();
  }, [reloadLicence]);

  // Chargement initial : affichage du loader au lieu d'un écran blanc
  if (licence === undefined) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const status = evaluateLicenceStatus(licence);

  if (status.state === 'valide') {
    // Même seuil que la carte détaillée de Réglages (voir LicenceSection.tsx) — averti
    // uniquement l'admin (seul rôle habilité à renouveler, voir Personnel.tsx) pour ne pas
    // alarmer un caissier qui ne peut rien y faire.
    const showBanner = personnel?.role === 'admin' && status.daysRemaining <= 15 && !bannerDismissed;
    return (
      <>
        {showBanner && (
          <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-3 text-xs sm:text-sm font-semibold relative">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              {status.daysRemaining === 1
                ? 'Ta licence expire demain !'
                : `Ta licence expire dans ${status.daysRemaining} jours`}
              {status.expireLe && ` (le ${new Date(status.expireLe).toLocaleDateString('fr-FR')})`} — pense à la
              renouveler dans Réglages pour éviter une coupure.
            </span>
            <button
              type="button"
              onClick={() => setBannerDismissed(true)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/80 hover:text-white transition-colors"
              title="Masquer pour cette session"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {children}
      </>
    );
  }

  if (status.state !== 'expiree') return <>{children}</>;

  const submitRenewal = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await renewLicence(cle);
      setCle('');
      await reloadLicence();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Clé de licence invalide.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md glass-card p-8 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-white/10">
        <div className="flex items-center gap-3.5 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-500 shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">Licence expirée</h1>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
              L'abonnement de cette boutique est arrivé à échéance{status.expireLe ? ` le ${new Date(status.expireLe).toLocaleDateString('fr-FR')}` : ''}.
            </p>
          </div>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-300 mb-5">
          Toutes les données restent en sécurité en local. Saisis une nouvelle clé de licence pour
          continuer à utiliser la caisse et le stock.
        </p>

        <form onSubmit={submitRenewal} className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Nouvelle clé de licence</label>
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
              >
                <Sparkles className="w-3 h-3 text-amber-500" />
                Essai gratuit (7 jours)
              </button>
            </div>
            <div className="relative">
              <KeyRound className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
              <input
                required
                autoFocus
                value={cle}
                onChange={(e) => setCle(e.target.value)}
                placeholder="IVTE-0030-XXXXXXXX-XXXXXXXX"
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
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold">
              {error}
            </div>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={submitting} icon={<KeyRound className="w-4 h-4" />}>
            {submitting ? 'Vérification...' : 'Activer cette clé'}
          </Button>
        </form>
      </div>
    </div>
  );
};
