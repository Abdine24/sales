import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, ShieldCheck, TimerReset, Sparkles, Clock, AlertTriangle, Info, Laptop } from 'lucide-react';
import type { Licence } from '../db/db';
import { apiGet, ApiError } from '../services/api';
import { evaluateLicenceStatus, APP_VERSION, APP_RELEASE_NAME } from '../utils/license';
import { renewLicence } from '../services/localAuth';
import { GlassCard } from './ui/GlassCard';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { useDialog } from './ui/DialogProvider';

export const LicenceSection: React.FC = () => {
  const { toast } = useDialog();
  const [licence, setLicence] = useState<Licence | null>(null);
  const [cle, setCle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const reloadLicence = useCallback(async () => {
    try {
      setLicence(await apiGet<Licence | null>('/licence'));
    } catch {
      // Statut affiché comme "absente" si l'appel échoue — le formulaire reste utilisable.
    }
  }, []);

  useEffect(() => {
    reloadLicence();
  }, [reloadLicence]);

  const status = evaluateLicenceStatus(licence);

  const submitRenewal = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await renewLicence(cle);
      setCle('');
      await reloadLicence();
      toast('Licence activée avec succès — votre nouvel abonnement a été validé et enregistré.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Clé de licence invalide.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <GlassCard>
      {/* Header with App Version */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-200/50 dark:border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white">Abonnement & Version Système</h3>
            <p className="text-xs text-slate-400">Gestion de la clé de licence annuelle et statut de validité.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10 flex items-center gap-1.5">
            <Laptop className="w-3.5 h-3.5 text-blue-500" />
            {APP_RELEASE_NAME} <strong className="text-slate-900 dark:text-white">v{APP_VERSION}</strong>
          </span>
        </div>
      </div>

      {/* Time Left & Licence Status Display */}
      <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100/80 dark:from-slate-900/60 dark:to-slate-800/40 border border-slate-200/70 dark:border-white/10 mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Temps Restant (Time Left)
              </span>
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {status.timeLeftFormatted}
            </div>
            {status.expireLe && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Valable jusqu'au : <strong className="text-slate-700 dark:text-slate-200">{new Date(status.expireLe).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</strong>
              </p>
            )}
          </div>

          <div className="flex flex-col items-start md:items-end gap-1.5">
            <div className="text-xs font-semibold text-slate-400">Statut de l'abonnement</div>
            {status.state === 'expiree' ? (
              <Badge variant="red" size="md">
                <TimerReset className="w-3.5 h-3.5" /> Licence Expirée
              </Badge>
            ) : status.daysRemaining <= 15 ? (
              <Badge variant="amber" size="md">
                <AlertTriangle className="w-3.5 h-3.5" /> Expiration Imminente ({status.daysRemaining}j)
              </Badge>
            ) : (
              <Badge variant="green" size="md">
                <CheckCircle2 className="w-3.5 h-3.5" /> Licence Active ({status.daysRemaining}j restants)
              </Badge>
            )}
          </div>
        </div>

        {/* Visual Progress Bar */}
        {status.state !== 'absente' && (
          <div className="space-y-1.5 pt-2 border-t border-slate-200/60 dark:border-white/5">
            <div className="flex justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <span>Validité restante (Max 1 an)</span>
              <span>{status.percentageLeft}%</span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  status.daysRemaining <= 15
                    ? 'bg-rose-500'
                    : status.daysRemaining <= 45
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.max(2, status.percentageLeft)}%` }}
              />
            </div>
          </div>
        )}

        {/* Active Key Info */}
        <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 gap-2">
          <span>Clé installée : <code className="font-mono font-bold text-slate-800 dark:text-slate-200">{licence?.cle || 'Aucune'}</code></span>
          <span className="text-[11px] text-slate-400 italic">Abonnement renouvelable annuellement (max 365 jours).</span>
        </div>
      </div>

      {/* Renewal Key Form — pas d'essai gratuit ici : il ne se propose qu'une fois, à
          l'activation initiale d'une boutique (voir AuthGate.tsx). Un compte qui accède aux
          Réglages en a forcément déjà eu un (ou n'y a jamais eu droit), donc seule une clé
          payante a du sens pour activer/renouveler depuis cet écran. */}
      <div>
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">
          Activer ou renouveler votre clé de licence
        </label>
        <form onSubmit={submitRenewal} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={cle}
              onChange={(e) => setCle(e.target.value)}
              placeholder="IVTE-0365-XXXXXXXX-XXXXXXXX"
              className="w-full glass-input pl-10 pr-4 py-3 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white font-mono uppercase font-bold"
            />
          </div>
          <Button type="submit" variant="primary" disabled={submitting || !cle.trim()} icon={<Sparkles className="w-4 h-4" />}>
            {submitting ? 'Vérification...' : 'Valider la clé'}
          </Button>
        </form>
        {error && <p className="text-xs font-semibold text-rose-500 mt-2">{error}</p>}
      </div>
    </GlassCard>
  );
};
