import React, { useCallback, useEffect, useState } from 'react';
import { LockKeyhole, Store, Megaphone, Settings2, LogOut, Send, RefreshCw, ShieldCheck } from 'lucide-react';
import { GlassCard } from '../components/ui/GlassCard';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useDialog } from '../components/ui/DialogProvider';
import { getOwnerToken, ownerLogin, ownerLogout, ownerGet, ownerPut, ownerPost } from '../services/ownerApi';
import { ApiError } from '../services/api';

interface Boutique {
  id: string;
  slug: string;
  nom: string;
  status: 'provisioning' | 'active' | 'suspended' | 'failed';
  created_at: string;
  provisioned_at: string | null;
}

interface PlatformConfigForm {
  whatsapp_number: string;
  contact_phone: string;
}

const statusBadge: Record<Boutique['status'], { variant: 'green' | 'amber' | 'red' | 'gray'; label: string }> = {
  active: { variant: 'green', label: 'Active' },
  provisioning: { variant: 'amber', label: 'En cours' },
  suspended: { variant: 'gray', label: 'Suspendue' },
  failed: { variant: 'red', label: 'Échec' },
};

// Page cachée réservée au propriétaire de la plateforme — vue d'ensemble de toutes les
// boutiques, réglages globaux (WhatsApp, téléphone), et diffusion de messages dans la cloche de
// notifications des admins. Accessible via /proprietaire (voir App.tsx), authentification par
// mot de passe dédié totalement séparée de Supabase (voir server/src/routes/plateforme.js).
export const OwnerConsole: React.FC = () => {
  const { toast, alert } = useDialog();
  const [authed, setAuthed] = useState(() => !!getOwnerToken());
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [loading, setLoading] = useState(false);
  const [boutiques, setBoutiques] = useState<Boutique[]>([]);
  const [config, setConfig] = useState<PlatformConfigForm>({ whatsapp_number: '', contact_phone: '' });
  const [savingConfig, setSavingConfig] = useState(false);

  const [annonceTarget, setAnnonceTarget] = useState<string>('all');
  const [annonceMessage, setAnnonceMessage] = useState('');
  const [sendingAnnonce, setSendingAnnonce] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [b, c] = await Promise.all([
        ownerGet<Boutique[]>('/plateforme/boutiques'),
        ownerGet<{ whatsapp_number: string | null; contact_phone: string | null }>('/plateforme/config'),
      ]);
      setBoutiques(b);
      setConfig({ whatsapp_number: c.whatsapp_number || '', contact_phone: c.contact_phone || '' });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuthed(false);
      } else {
        await alert(err instanceof ApiError ? err.message : 'Impossible de charger les données.');
      }
    } finally {
      setLoading(false);
    }
  }, [alert]);

  useEffect(() => {
    if (authed) reload();
  }, [authed, reload]);

  const submitLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginError('');
    setLoggingIn(true);
    try {
      await ownerLogin(password);
      setPassword('');
      setAuthed(true);
    } catch (err) {
      setLoginError(err instanceof ApiError ? err.message : 'Connexion impossible.');
    } finally {
      setLoggingIn(false);
    }
  };

  const logout = () => {
    ownerLogout();
    setAuthed(false);
  };

  const saveConfig = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingConfig(true);
    try {
      await ownerPut('/plateforme/config', config);
      toast('Réglages enregistrés.');
    } catch (err) {
      await alert(err instanceof ApiError ? err.message : "Échec de l'enregistrement.");
    } finally {
      setSavingConfig(false);
    }
  };

  const sendAnnonce = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!annonceMessage.trim()) return;
    setSendingAnnonce(true);
    try {
      const result = await ownerPost<{ sent: number; failed: number }>('/plateforme/annonce', {
        target: annonceTarget,
        message: annonceMessage.trim(),
      });
      toast(`Message envoyé à ${result.sent} boutique(s)${result.failed ? ` (${result.failed} échec(s))` : ''}.`);
      setAnnonceMessage('');
    } catch (err) {
      await alert(err instanceof ApiError ? err.message : "Échec de l'envoi.");
    } finally {
      setSendingAnnonce(false);
    }
  };

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950">
        <GlassCard className="w-full max-w-sm">
          <div className="flex flex-col items-center gap-2 mb-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">Espace propriétaire</h1>
            <p className="text-xs text-slate-400">Réservé — accès par mot de passe dédié.</p>
          </div>
          <form onSubmit={submitLogin} className="space-y-3">
            <div className="relative">
              <LockKeyhole className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mot de passe"
                className="w-full glass-input pl-10 pr-4 py-3 rounded-xl text-sm text-slate-900 dark:text-white"
              />
            </div>
            {loginError && <p className="text-xs font-semibold text-rose-500">{loginError}</p>}
            <Button type="submit" variant="primary" className="w-full" disabled={loggingIn || !password}>
              {loggingIn ? 'Connexion...' : 'Se connecter'}
            </Button>
          </form>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-8 bg-slate-100 dark:bg-slate-950 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-blue-500" /> Espace propriétaire
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={reload} disabled={loading}>
            Actualiser
          </Button>
          <Button variant="ghost" size="sm" icon={<LogOut className="w-3.5 h-3.5" />} onClick={logout}>
            Déconnexion
          </Button>
        </div>
      </div>

      {/* Boutiques */}
      <GlassCard>
        <h2 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2 mb-4">
          <Store className="w-4 h-4 text-blue-500" /> Boutiques ({boutiques.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-200/60 dark:border-white/10">
                <th className="py-2 pr-4 font-semibold">Boutique</th>
                <th className="py-2 pr-4 font-semibold">Adresse</th>
                <th className="py-2 pr-4 font-semibold">Statut</th>
                <th className="py-2 pr-4 font-semibold">Créée le</th>
              </tr>
            </thead>
            <tbody>
              {boutiques.map((b) => (
                <tr key={b.id} className="border-b border-slate-200/40 dark:border-white/5">
                  <td className="py-2 pr-4 font-semibold text-slate-800 dark:text-slate-100">{b.nom}</td>
                  <td className="py-2 pr-4 font-mono text-slate-500">{b.slug}.azanga.tech</td>
                  <td className="py-2 pr-4">
                    <Badge variant={statusBadge[b.status].variant} size="sm">
                      {statusBadge[b.status].label}
                    </Badge>
                  </td>
                  <td className="py-2 pr-4 text-slate-400">
                    {new Date(b.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </td>
                </tr>
              ))}
              {boutiques.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-400">
                    Aucune boutique.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Réglages globaux */}
        <GlassCard>
          <h2 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2 mb-4">
            <Settings2 className="w-4 h-4 text-blue-500" /> Réglages globaux
          </h2>
          <form onSubmit={saveConfig} className="space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 block">
                Numéro WhatsApp (format international, sans "+")
              </label>
              <input
                value={config.whatsapp_number}
                onChange={(e) => setConfig((c) => ({ ...c, whatsapp_number: e.target.value }))}
                placeholder="226XXXXXXXXX"
                className="w-full glass-input px-4 py-2.5 rounded-xl text-sm text-slate-900 dark:text-white font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 block">
                Téléphone de contact (affiché, optionnel)
              </label>
              <input
                value={config.contact_phone}
                onChange={(e) => setConfig((c) => ({ ...c, contact_phone: e.target.value }))}
                placeholder="+226 XX XX XX XX"
                className="w-full glass-input px-4 py-2.5 rounded-xl text-sm text-slate-900 dark:text-white"
              />
            </div>
            <Button type="submit" variant="primary" size="sm" disabled={savingConfig}>
              {savingConfig ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </form>
        </GlassCard>

        {/* Annonce */}
        <GlassCard>
          <h2 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2 mb-4">
            <Megaphone className="w-4 h-4 text-blue-500" /> Envoyer une annonce
          </h2>
          <p className="text-[11px] text-slate-400 mb-3">
            Apparaît dans la cloche de notifications des admins de la/les boutique(s) ciblée(s).
          </p>
          <form onSubmit={sendAnnonce} className="space-y-3">
            <select
              value={annonceTarget}
              onChange={(e) => setAnnonceTarget(e.target.value)}
              className="w-full glass-input px-4 py-2.5 rounded-xl text-sm text-slate-900 dark:text-white"
            >
              <option value="all">Toutes les boutiques actives</option>
              {boutiques
                .filter((b) => b.status === 'active')
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nom} ({b.slug})
                  </option>
                ))}
            </select>
            <textarea
              value={annonceMessage}
              onChange={(e) => setAnnonceMessage(e.target.value)}
              placeholder="Message à diffuser..."
              rows={3}
              className="w-full glass-input px-4 py-2.5 rounded-xl text-sm text-slate-900 dark:text-white resize-none"
            />
            <Button type="submit" variant="primary" size="sm" icon={<Send className="w-3.5 h-3.5" />} disabled={sendingAnnonce || !annonceMessage.trim()}>
              {sendingAnnonce ? 'Envoi...' : 'Envoyer'}
            </Button>
          </form>
        </GlassCard>
      </div>
    </div>
  );
};
