import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LockKeyhole, Store, Megaphone, Settings2, LogOut, Send, RefreshCw, ShieldCheck, Phone, MapPin,
  Power, Search, Users, Package, Wallet, KeyRound, History, Sun, Moon, ChevronDown, Calendar,
  Eye, Download, HelpCircle, FileText, Check, AlertTriangle,
} from 'lucide-react';
import { GlassCard } from '../components/ui/GlassCard';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useDialog } from '../components/ui/DialogProvider';
import { getOwnerToken, ownerLogin, ownerLogout, ownerGet, ownerPut, ownerPost, ownerDelete, ownerGetBlob } from '../services/ownerApi';
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

interface ReceiptTemplate {
  id: string;
  nom: string;
  description: string;
  html: string;
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
  if (!licence) return { variant: 'gray' as const, label: 'Aucune licence' };
  const status = evaluateLicenceStatus(licence);
  if (status.state === 'expiree') return { variant: 'red' as const, label: 'Expirée' };
  const isTrial = licence.duree_jours === 7;
  const suffix = `${status.daysRemaining}j`;
  if (status.daysRemaining <= 15) return { variant: 'amber' as const, label: `${isTrial ? 'Essai' : 'Payante'} · ${suffix}` };
  return { variant: 'green' as const, label: `${isTrial ? 'Essai' : 'Payante'} · ${suffix}` };
};

type ThemeMode = 'light' | 'dark';
const THEME_KEY = 'owner-console-theme';

// Petite puce compacte icône+valeur — utilisée partout dans la carte boutique pour garder
// chaque info courte et lisible, quelle que soit la largeur disponible (elles s'enroulent
// naturellement grâce à flex-wrap, contrairement à des colonnes de tableau).
const StatChip: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-500/5 border border-slate-200/50 dark:border-white/10 text-slate-600 dark:text-slate-300">
    {icon}
    {children}
  </span>
);

// Page cachée réservée au propriétaire de la plateforme — vue d'ensemble de toutes les
// boutiques, réglages globaux (WhatsApp, téléphone), et diffusion de messages dans la cloche de
// notifications des admins. Accessible via /proprietaire (voir App.tsx), authentification par
// mot de passe dédié totalement séparée de Supabase (voir server/src/routes/plateforme.js).
export const OwnerConsole: React.FC = () => {
  const { toast, alert, confirm } = useDialog();

  // Thème clair/sombre — page rendue en dehors de l'app principale (voir App.tsx), donc pas de
  // classe "dark" posée par ailleurs sur <html> : on la gère nous-mêmes ici, avec sa propre clé
  // localStorage (indépendante du thème de l'app boutique) et la préférence système par défaut.
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(THEME_KEY) as ThemeMode | null;
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => {
    localStorage.setItem(THEME_KEY, themeMode);
    document.documentElement.classList.toggle('dark', themeMode === 'dark');
  }, [themeMode]);

  const [authed, setAuthed] = useState(() => !!getOwnerToken());
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [loading, setLoading] = useState(false);
  const [boutiques, setBoutiques] = useState<Boutique[]>([]);
  const [config, setConfig] = useState<PlatformConfigForm>({ whatsapp_number: '', contact_phone: '' });
  const [savingConfig, setSavingConfig] = useState(false);
  const [annonces, setAnnonces] = useState<Annonce[]>([]);
  const [templates, setTemplates] = useState<ReceiptTemplate[]>([]);

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

  // Détails secondaires (téléphone, zones, employés, produits, dates) repliés par défaut — une
  // carte n'affiche d'entrée que l'essentiel (nom, statut, licence, CA) pour ne pas noyer
  // l'écran dès qu'il y a plusieurs boutiques.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
      const [b, c, a, t] = await Promise.all([
        ownerGet<Boutique[]>('/plateforme/boutiques'),
        ownerGet<{ whatsapp_number: string | null; contact_phone: string | null }>('/plateforme/config'),
        ownerGet<Annonce[]>('/plateforme/annonces'),
        ownerGet<ReceiptTemplate[]>('/plateforme/templates'),
      ]);
      setBoutiques(b);
      setConfig({ whatsapp_number: c.whatsapp_number || '', contact_phone: c.contact_phone || '' });
      setAnnonces(a);
      setTemplates(t);
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

  const handleTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const htmlContent = await file.text();
      // Simple parse to extract title if any, or use filename
      const nom = file.name.replace('.html', '');
      
      const newTemplate = await ownerPost<ReceiptTemplate>('/plateforme/templates', {
        nom,
        description: 'Ajouté par le propriétaire',
        html: htmlContent
      });
      
      setTemplates(prev => [newTemplate, ...prev]);
      toast(`Modèle "${nom}" ajouté avec succès.`);
    } catch (err) {
      await alert(err instanceof ApiError ? err.message : "Échec de l'upload.");
    } finally {
      // Reset input
      e.target.value = '';
    }
  };

  const handleDeleteTemplate = async (templateId: string, nom: string) => {
    const ok = await confirm({
      title: 'Supprimer ce modèle ?',
      message: `Voulez-vous vraiment supprimer le modèle "${nom}" ? Il ne sera plus disponible pour les boutiques.`,
      confirmLabel: 'Supprimer',
      danger: true
    });
    if (!ok) return;

    try {
      await ownerDelete(`/plateforme/templates/${templateId}`);
      setTemplates(prev => prev.filter(t => t.id !== templateId));
      toast('Modèle supprimé.');
    } catch (err) {
      await alert(err instanceof ApiError ? err.message : 'Échec de la suppression.');
    }
  };

  const [previewingTemplateId, setPreviewingTemplateId] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const handlePreviewTemplate = async (templateId: string, nom: string) => {
    setPreviewingTemplateId(templateId);
    try {
      const blob = await ownerGetBlob(`/plateforme/templates/${templateId}/apercu.pdf`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Apercu-${nom.replace(/\s+/g, '_')}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      await alert(err instanceof ApiError ? err.message : "Échec de la génération de l'aperçu.");
    } finally {
      setPreviewingTemplateId(null);
    }
  };

  const handleDownloadStarterTemplate = () => {
    const starterHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Modèle de Facture - iVente</title>
    <style>
        * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        body {
            background-color: #ffffff;
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            color: #1e293b;
        }
        .a4-page {
            width: 210mm;
            margin: 0 auto;
            background: #ffffff;
            padding: 30px;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 20px;
            margin-bottom: 25px;
        }
        .company-name { font-size: 22px; font-weight: 700; color: #0f172a; }
        .company-slogan { font-size: 12px; color: #64748b; margin-top: 4px; }
        .title { font-size: 24px; font-weight: 800; color: #2563eb; text-align: right; }
        .meta { font-size: 12px; color: #64748b; text-align: right; margin-top: 6px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px; }
        .card { background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; }
        .card-title { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 8px; }
        .card-text { font-size: 13px; line-height: 1.5; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
        th { background: #0f172a; color: #ffffff; font-size: 11px; text-transform: uppercase; padding: 10px 12px; text-align: left; }
        td { padding: 12px; font-size: 13px; border-bottom: 1px solid #e2e8f0; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .totals { display: flex; justify-content: flex-end; margin-bottom: 30px; }
        .totals-box { width: 280px; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; }
        .total-row { display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0; color: #475569; }
        .total-net { font-size: 16px; font-weight: 700; color: #0f172a; border-top: 2px solid #cbd5e1; padding-top: 8px; margin-top: 6px; }
        .footer { text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; }
    </style>
</head>
<body>
    <div class="a4-page">
        <div class="header">
            <div>
                <!--IF_LOGO--><img src="{logo}" alt="Logo" style="max-height: 50px; margin-bottom: 10px;"><br><!--/IF_LOGO-->
                <div class="company-name">{boutique}</div>
                <!--IF_SLOGAN--><div class="company-slogan">{slogan}</div><!--/IF_SLOGAN-->
            </div>
            <div>
                <div class="title">FACTURE</div>
                <div class="meta">
                    <div><strong>N° :</strong> {ref}</div>
                    <div><strong>Date :</strong> {date}</div>
                    <!--IF_DUPLICATA--><div style="color: #ef4444; font-weight: 700; margin-top: 4px;">{duplicata}</div><!--/IF_DUPLICATA-->
                </div>
            </div>
        </div>

        <div class="info-grid">
            <div class="card">
                <div class="card-title">ÉMETTEUR</div>
                <div class="card-text">
                    <strong>{boutique}</strong><br>
                    <!--IF_ADRESSE-->Adresse : {adresse}<br><!--/IF_ADRESSE-->
                    <!--IF_TELEPHONE_BOUTIQUE-->Tél : {telephone_boutique}<br><!--/IF_TELEPHONE_BOUTIQUE-->
                    <!--IF_IFU-->IFU : {ifu}<!--/IF_IFU-->
                </div>
            </div>
            <div class="card">
                <div class="card-title">FACTURÉ À</div>
                <div class="card-text">
                    <strong>{client}</strong><br>
                    <!--IF_TELEPHONE_CLIENT-->Tél : {telephone_client}<br><!--/IF_TELEPHONE_CLIENT-->
                    <!--IF_VENDEUR_NOM-->Vendeur : {vendeur_nom}<!--/IF_VENDEUR_NOM-->
                </div>
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th style="width: 8%;">#</th>
                    <th style="width: 50%;">Désignation</th>
                    <th class="text-center" style="width: 10%;">Qté</th>
                    <th class="text-right" style="width: 16%;">P.U.</th>
                    <th class="text-right" style="width: 16%;">Total</th>
                </tr>
            </thead>
            <tbody>
                <!--ITEMS-->
                <tr>
                    <td>{item_index}</td>
                    <td>
                        <strong>{item_nom}</strong>
                        <div>{item_attributs}</div>
                    </td>
                    <td class="text-center">{item_qte}</td>
                    <td class="text-right">{item_prix_unitaire}</td>
                    <td class="text-right"><strong>{item_total}</strong></td>
                </tr>
                <!--/ITEMS-->
            </tbody>
        </table>

        <div class="totals">
            <div class="totals-box">
                <!--IF_REMISE-->
                <div class="total-row">
                    <span>Sous-total :</span>
                    <span>{sous_total}</span>
                </div>
                <div class="total-row" style="color: #ef4444;">
                    <span>Remise :</span>
                    <span>-{remise}</span>
                </div>
                <!--/IF_REMISE-->
                <div class="total-row total-net">
                    <span>NET À PAYER :</span>
                    <span style="color: #2563eb;">{total}</span>
                </div>
                <div class="total-row" style="margin-top: 6px;">
                    <span>Montant réglé :</span>
                    <span>{paye}</span>
                </div>
                <!--IF_RESTE-->
                <div class="total-row" style="color: #ef4444; font-weight: 700;">
                    <span>Reste à payer :</span>
                    <span>{reste}</span>
                </div>
                <!--/IF_RESTE-->
            </div>
        </div>

        <div class="footer">
            Merci de votre confiance ! Document généré le {date}.
        </div>
    </div>
</body>
</html>`;

    const blob = new Blob([starterHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Modele-Facture-iVente.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };


  const ThemeToggle = (
    <button
      type="button"
      onClick={() => setThemeMode((m) => (m === 'dark' ? 'light' : 'dark'))}
      className="p-2 rounded-xl glass-card border border-slate-200/60 dark:border-white/10 text-slate-500 dark:text-slate-300 hover:text-blue-500 transition-colors"
      title={themeMode === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
    >
      {themeMode === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-100 dark:bg-slate-950">
        <div className="absolute top-4 right-4">{ThemeToggle}</div>
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-blue-500" /> Espace propriétaire
        </h1>
        <div className="flex items-center gap-2">
          {ThemeToggle}
          <Button variant="ghost" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={reload} disabled={loading}>
            Actualiser
          </Button>
          <Button variant="ghost" size="sm" icon={<LogOut className="w-3.5 h-3.5" />} onClick={logout}>
            Déconnexion
          </Button>
        </div>
      </div>

      {/* Boutiques */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h2 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <Store className="w-4 h-4 text-blue-500" /> Boutiques ({filteredBoutiques.length}/{boutiques.length})
          </h2>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher..."
                className="glass-input pl-8 pr-3 py-1.5 rounded-lg text-xs text-slate-900 dark:text-white w-full sm:w-44"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as Boutique['status'] | 'all')}
              className="glass-input px-2.5 py-1.5 rounded-lg text-xs text-slate-900 dark:text-white shrink-0"
            >
              <option value="all">Tous statuts</option>
              <option value="active">Active</option>
              <option value="suspended">Suspendue</option>
              <option value="provisioning">En cours</option>
              <option value="failed">Échec</option>
            </select>
          </div>
        </div>

        {filteredBoutiques.length === 0 && !loading && (
          <GlassCard>
            <p className="text-xs text-slate-400 text-center py-4">
              {boutiques.length === 0 ? 'Aucune boutique.' : 'Aucun résultat pour ce filtre.'}
            </p>
          </GlassCard>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredBoutiques.map((b) => {
            const lb = licenceBadge(b.licence);
            const expanded = expandedIds.has(b.id);
            return (
              <GlassCard key={b.id} className="flex flex-col gap-3">
                {/* Essentiel — toujours visible */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">{b.nom}</h3>
                    <p className="text-[11px] font-mono text-slate-400 truncate">{b.slug}.azanga.tech</p>
                  </div>
                  <Badge variant={statusBadge[b.status].variant} size="sm">
                    {statusBadge[b.status].label}
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Badge variant={lb.variant} size="sm" title={b.licence?.cle}>
                    <KeyRound className="w-3 h-3" /> {lb.label}
                  </Badge>
                  {b.chiffre_affaires !== null && (
                    <StatChip icon={<Wallet className="w-3 h-3" />}>{formatCfaCompact(b.chiffre_affaires)}</StatChip>
                  )}
                </div>

                {/* Détails secondaires — repliés par défaut */}
                <button
                  type="button"
                  onClick={() => toggleExpanded(b.id)}
                  className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-blue-500 transition-colors self-start"
                >
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                  {expanded ? 'Masquer les détails' : 'Voir les détails'}
                </button>

                {expanded && (
                  <div className="flex flex-wrap gap-1.5 text-[11px] pt-1 border-t border-slate-200/50 dark:border-white/10">
                    {b.telephone && <StatChip icon={<Phone className="w-3 h-3" />}>{b.telephone}</StatChip>}
                    {b.zones_actives !== null && <StatChip icon={<MapPin className="w-3 h-3" />}>{b.zones_actives} zone(s)</StatChip>}
                    {b.personnel_count !== null && <StatChip icon={<Users className="w-3 h-3" />}>{b.personnel_count} employé(s)</StatChip>}
                    {b.produits_count !== null && <StatChip icon={<Package className="w-3 h-3" />}>{b.produits_count} produit(s)</StatChip>}
                    <StatChip icon={<Calendar className="w-3 h-3" />}>
                      créée le {new Date(b.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </StatChip>
                  </div>
                )}

                {/* Action */}
                {(b.status === 'active' || b.status === 'suspended') && (
                  <button
                    type="button"
                    onClick={() => toggleStatus(b)}
                    disabled={togglingId === b.id}
                    className={`mt-auto text-[11px] font-bold px-2.5 py-1.5 rounded-lg border flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60 ${
                      b.status === 'active'
                        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/20'
                        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                    }`}
                  >
                    <Power className="w-3 h-3" />
                    {togglingId === b.id ? '...' : b.status === 'active' ? 'Désactiver' : 'Réactiver'}
                  </button>
                )}
              </GlassCard>
            );
          })}
        </div>
      </div>

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

      {/* Templates de reçus A4 (Gestion globale) */}
      <GlassCard>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-500" /> Modèles de Reçus A4 
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Fichiers HTML mis à disposition de toutes les boutiques dans leurs paramètres.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadStarterTemplate}
              className="px-3 py-1.5 rounded-lg glass-card border border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 text-xs font-bold transition-colors inline-flex items-center gap-1.5"
              title="Télécharger un modèle HTML exemple valide et prêt à être personnalisé"
            >
              <Download className="w-3.5 h-3.5" /> Modèle exemple (.html)
            </button>
            <button
              type="button"
              onClick={() => setShowGuide((v) => !v)}
              className="px-3 py-1.5 rounded-lg glass-card border border-slate-300 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-500/10 text-xs font-bold transition-colors inline-flex items-center gap-1.5"
            >
              <HelpCircle className="w-3.5 h-3.5 text-blue-500" /> Guide balises
            </button>
            <input 
              type="file" 
              accept=".html"
              id="upload-template" 
              className="hidden" 
              onChange={handleTemplateUpload} 
            />
            <label 
              htmlFor="upload-template"
              className="cursor-pointer px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors inline-flex items-center gap-1.5"
            >
              + Importer un fichier .html
            </label>
          </div>
        </div>

        {/* Guide des balises (accordéon) */}
        {showGuide && (
          <div className="p-4 mb-4 rounded-xl bg-blue-500/5 border border-blue-500/20 text-xs space-y-3">
            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-sm">
              <HelpCircle className="w-4 h-4 text-blue-500" /> Documentation du moteur de reçus HTML
            </div>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              Pour créer un modèle compatible, utilisez un fichier <code>.html</code> encodé en UTF-8. 
              Le serveur nettoie automatiquement les liens Google Fonts distants et force la mise en page A4.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
              <div className="p-2 rounded bg-slate-100 dark:bg-slate-900/60">
                <span className="font-bold text-blue-600 dark:text-blue-400">&#123;boutique&#125;</span> : Nom du magasin
              </div>
              <div className="p-2 rounded bg-slate-100 dark:bg-slate-900/60">
                <span className="font-bold text-blue-600 dark:text-blue-400">&#123;client&#125;</span> : Nom du client
              </div>
              <div className="p-2 rounded bg-slate-100 dark:bg-slate-900/60">
                <span className="font-bold text-blue-600 dark:text-blue-400">&#123;ref&#125;</span> : Réf / Numéro facture
              </div>
              <div className="p-2 rounded bg-slate-100 dark:bg-slate-900/60">
                <span className="font-bold text-blue-600 dark:text-blue-400">&#123;date&#125;</span> : Date de vente
              </div>
              <div className="p-2 rounded bg-slate-100 dark:bg-slate-900/60">
                <span className="font-bold text-blue-600 dark:text-blue-400">&#123;total&#125;</span> : Montant net à payer
              </div>
              <div className="p-2 rounded bg-slate-100 dark:bg-slate-900/60">
                <span className="font-bold text-blue-600 dark:text-blue-400">&#123;paye&#125;</span> : Montant encaissé
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-800 dark:text-amber-300">
              <strong>Bloc articles obligatoire :</strong> Entourez les lignes du tableau avec <code>&lt;!--ITEMS--&gt; ... &lt;!--/ITEMS--&gt;</code>. 
              Balises d'articles disponibles : <code>&#123;item_index&#125;</code>, <code>&#123;item_nom&#125;</code>, <code>&#123;item_attributs&#125;</code>, <code>&#123;item_qte&#125;</code>, <code>&#123;item_prix_unitaire&#125;</code>, <code>&#123;item_total&#125;</code>.
            </div>
          </div>
        )}

        {templates.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6 border border-dashed border-slate-200/50 dark:border-white/10 rounded-xl">
            Aucun modèle dynamique ajouté. Les boutiques n'ont accès qu'aux modèles intégres.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {templates.map(t => {
              const isPreviewing = previewingTemplateId === t.id;
              return (
                <div key={t.id} className="p-3.5 rounded-xl border border-slate-200/60 dark:border-white/10 bg-slate-50/50 dark:bg-slate-900/30 flex flex-col">
                  <div className="font-bold text-sm text-slate-900 dark:text-white mb-1 truncate">{t.nom}</div>
                  <div className="text-[11px] text-slate-500 mb-3 truncate">{t.description}</div>
                  <div className="mt-auto flex justify-between items-center pt-2.5 border-t border-slate-200/50 dark:border-white/5">
                    <button
                      type="button"
                      disabled={isPreviewing}
                      onClick={() => handlePreviewTemplate(t.id, t.nom)}
                      className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      <Eye className="w-3 h-3" />
                      {isPreviewing ? 'Génération...' : 'Aperçu PDF'}
                    </button>
                    <button 
                      onClick={() => handleDeleteTemplate(t.id, t.nom)}
                      className="text-[11px] font-bold text-rose-500 hover:underline"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

    </div>
  );
};

