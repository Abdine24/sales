import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LockKeyhole, Store, Megaphone, Settings2, LogOut, Send, RefreshCw, ShieldCheck, Phone, MapPin,
  Power, Search, Users, Package, Wallet, KeyRound, History,
} from 'lucide-react';
import { GlassCard } from '../components/ui/GlassCard';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useDialog } from '../components/ui/DialogProvider';
import { getOwnerToken, ownerLogin, ownerLogout, ownerGet, ownerPut, ownerPost } from '../services/ownerApi';
import { ApiError } from '../services/api';
import { evaluateLicenceStatus } from '../utils/license';
import { formatCfaCompact } from '../utils/currency';

interface BoutiqueLicence {
  cle: string;
  activee_le: string;
  expire_le: string | null;
  duree_jours: number | null;
  trial_used: boolean;
}

interface Boutique {
  id: string;
  slug: string;
  nom: string;
  status: 'provisioning' | 'active' | 'suspended' | 'failed';
  created_at: string;
  provisioned_at: string | null;
  telephone: string | null;
  zones_actives: number | null;
  personnel_count: number | null;
  produits_count: number | null;
  chiffre_affaires: number | null;
  licence: BoutiqueLicence | null;
}

interface Annonce {
  id: number;
  message: string;
  target_label: string;
  sent_count: number;
  failed_count: number;
  created_at: string;
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

// Une clé de 7 jours ne peut venir que du preset d'essai gratuit — même heuristique déjà
// utilisée côté serveur (voir server/src/routes/licenceStatus.js) pour reconnaître un essai.
const licenceBadge = (licence: BoutiqueLicence | null) => {
  if (!licence) return { variant: 'gray' as const, label: 'Aucune' };
  const status = evaluateLicenceStatus(licence);
  if (status.state === 'expiree') return { variant: 'red' as const, label: 'Expirée' };
  const isTrial = licence.duree_jours === 7;
  const suffix = `${status.daysRemaining}j`;
  if (status.daysRemaining <= 15) return { variant: 'amber' as const, label: `${isTrial ? 'Essai' : 'Payante'} · ${suffix}` };
  return { variant: 'green' as const, label: `${isTrial ? 'Essai' : 'Payante'} · ${suffix}` };
};

// Page cachée réservée au propriétaire de la plateforme — vue d'ensemble de toutes les
// boutiques, réglages globaux (WhatsApp, téléphone), et diffusion de messages dans la cloche de
// notifications des admins. Accessible via /proprietaire (voir App.tsx), authentification par
// mot de passe dédié totalement séparée de Supabase (voir server/src/routes/plateforme.js).
export const OwnerConsole: React.FC = () => {
  const { toast, alert, confirm } = useDialog();
  const [authed, setAuthed] = useState(() => !!getOwnerToken());
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [loading, setLoading] = useState(false);
  const [boutiques, setBoutiques] = useState<Boutique[]>([]);
  const [config, setConfig] = useState<PlatformConfigForm>({ whatsapp_number: '', contact_phone: '' });
  const [savingConfig, setSavingConfig] = useState(false);
  const [annonces, setAnnonces] = useState<Annonce[]>([]);

  // Recherche/filtre — purement côté client : le nombre de boutiques reste modeste, pas besoin
  // d'un aller-retour serveur pour ça.
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<Boutique['status'] | 'all'>('all');
  const filteredBoutiques = useMemo(() => {
    const q = search.trim().toLowerCase();
    return boutiques.filter((b) => {
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (q && !b.nom.toLowerCase().includes(q) && !b.slug.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [boutiques, search, statusFilter]);

  const [togglingId, setTogglingId] = useState<string | null>(null);

  const toggleStatus = async (b: Boutique) => {
    const nextStatus = b.status === 'active' ? 'suspended' : 'active';
    if (nextStatus === 'suspended') {
      const ok = await confirm({
        title: `Désactiver "${b.nom}" ?`,
        message: "Tous ses utilisateurs (y compris l'admin) perdront immédiatement l'accès — connexion et API bloquées jusqu'à réactivation.",
        confirmLabel: 'Désactiver',
        danger: true,
      });
      if (!ok) return;
    }
    setTogglingId(b.id);
    try {
      await ownerPut(`/plateforme/boutiques/${b.id}/statut`, { status: nextStatus });
      setBoutiques((prev) => prev.map((x) => (x.id === b.id ? { ...x, status: nextStatus } : x)));
      toast(nextStatus === 'active' ? `"${b.nom}" réactivée.` : `"${b.nom}" désactivée.`);
    } catch (err) {
      await alert(err instanceof ApiError ? err.message : 'Échec du changement de statut.');
    } finally {
      setTogglingId(null);
    }
  };

  const [annonceTarget, setAnnonceTarget] = useState<string>('all');
  const [annonceMessage, setAnnonceMessage] = useState('');
  const [sendingAnnonce, setSendingAnnonce] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [b, c, a] = await Promise.all([
        ownerGet<Boutique[]>('/plateforme/boutiques'),
        ownerGet<{ whatsapp_number: string | null; contact_phone: string | null }>('/plateforme/config'),
        ownerGet<Annonce[]>('/plateforme/annonces'),
      ]);
      setBoutiques(b);
      setConfig({ whatsapp_number: c.whatsapp_number || '', contact_phone: c.contact_phone || '' });
      setAnnonces(a);
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
      ownerGet<Annonce[]>('/plateforme/annonces').then(setAnnonces).catch(() => {});
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h2 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <Store className="w-4 h-4 text-blue-500" /> Boutiques ({filteredBoutiques.length}/{boutiques.length})
          </h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher (nom, adresse)..."
                className="glass-input pl-8 pr-3 py-1.5 rounded-lg text-xs text-slate-900 dark:text-white w-48"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as Boutique['status'] | 'all')}
              className="glass-input px-2.5 py-1.5 rounded-lg text-xs text-slate-900 dark:text-white"
            >
              <option value="all">Tous statuts</option>
              <option value="active">Active</option>
              <option value="suspended">Suspendue</option>
              <option value="provisioning">En cours</option>
              <option value="failed">Échec</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-200/60 dark:border-white/10">
                <th className="py-2 pr-4 font-semibold">Boutique</th>
                <th className="py-2 pr-4 font-semibold">Adresse</th>
                <th className="py-2 pr-4 font-semibold">Téléphone</th>
                <th className="py-2 pr-4 font-semibold">Zones actives</th>
                <th className="py-2 pr-4 font-semibold">Employés</th>
                <th className="py-2 pr-4 font-semibold">Produits</th>
                <th className="py-2 pr-4 font-semibold">Chiffre d'affaires</th>
                <th className="py-2 pr-4 font-semibold">Licence</th>
                <th className="py-2 pr-4 font-semibold">Statut</th>
                <th className="py-2 pr-4 font-semibold">Créée le</th>
                <th className="py-2 pr-4 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBoutiques.map((b) => {
                const lb = licenceBadge(b.licence);
                return (
                  <tr key={b.id} className="border-b border-slate-200/40 dark:border-white/5">
                    <td className="py-2 pr-4 font-semibold text-slate-800 dark:text-slate-100">{b.nom}</td>
                    <td className="py-2 pr-4 font-mono text-slate-500">{b.slug}.azanga.tech</td>
                    <td className="py-2 pr-4 text-slate-500">
                      {b.telephone ? (
                        <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {b.telephone}</span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-slate-500">
                      {b.zones_actives === null ? (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      ) : (
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {b.zones_actives}</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-slate-500">
                      {b.personnel_count === null ? (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      ) : (
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {b.personnel_count}</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-slate-500">
                      {b.produits_count === null ? (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      ) : (
                        <span className="flex items-center gap-1"><Package className="w-3 h-3" /> {b.produits_count}</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-slate-500">
                      {b.chiffre_affaires === null ? (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      ) : (
                        <span className="flex items-center gap-1"><Wallet className="w-3 h-3" /> {formatCfaCompact(b.chiffre_affaires)}</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant={lb.variant} size="sm" title={b.licence?.cle}>
                        <KeyRound className="w-3 h-3" /> {lb.label}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant={statusBadge[b.status].variant} size="sm">
                        {statusBadge[b.status].label}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4 text-slate-400">
                      {new Date(b.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </td>
                    <td className="py-2 pr-4">
                      {(b.status === 'active' || b.status === 'suspended') && (
                        <button
                          type="button"
                          onClick={() => toggleStatus(b)}
                          disabled={togglingId === b.id}
                          className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1.5 transition-colors disabled:opacity-60 ${
                            b.status === 'active'
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/20'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                          }`}
                        >
                          <Power className="w-3 h-3" />
                          {togglingId === b.id ? '...' : b.status === 'active' ? 'Désactiver' : 'Réactiver'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredBoutiques.length === 0 && !loading && (
                <tr>
                  <td colSpan={11} className="py-6 text-center text-slate-400">
                    {boutiques.length === 0 ? 'Aucune boutique.' : 'Aucun résultat pour ce filtre.'}
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

      {/* Historique des annonces */}
      <GlassCard>
        <h2 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2 mb-4">
          <History className="w-4 h-4 text-blue-500" /> Historique des annonces
        </h2>
        {annonces.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">Aucune annonce envoyée pour l'instant.</p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {annonces.map((a) => (
              <div key={a.id} className="p-3 rounded-xl bg-slate-500/5 border border-slate-200/50 dark:border-white/10">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs text-slate-700 dark:text-slate-200 leading-snug">{a.message}</p>
                  <span className="text-[10px] text-slate-400 shrink-0">
                    {new Date(a.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {a.target_label} · envoyé à {a.sent_count} boutique(s){a.failed_count ? `, ${a.failed_count} échec(s)` : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
};
