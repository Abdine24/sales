import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LockKeyhole, Store, Megaphone, Settings2, LogOut, Send, RefreshCw, ShieldCheck, Phone, MapPin,
  Power, Search, Users, Package, Wallet, KeyRound, History, Sun, Moon, ChevronDown, Calendar,
  Eye, Download, HelpCircle, FileText, Check, Copy, Plus, Trash2, Mail, ExternalLink,
} from 'lucide-react';
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

interface AdminPrincipal {
  nom: string;
  username: string;
  email: string | null;
}

interface CatalogueLicence {
  cle: string;
  duree_jours: number;
  preset_label: string;
  status: 'unused' | 'active' | 'expired' | 'revoked';
  client_cible: string | null;
  boutique_id: string | null;
  boutique_nom: string | null;
  boutique_slug: string | null;
  created_at: string;
  activated_at: string | null;
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
  admin_principal: AdminPrincipal | null;
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

// Card solide à 100% d'opacité (sans aucun effet glassmorphism / flou)
const SolidCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-4 sm:p-6 text-slate-900 dark:text-white transition-colors ${className}`}>
    {children}
  </div>
);

// Puce compacte pour les statistiques
const StatChip: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
    {icon}
    {children}
  </span>
);

export const OwnerConsole: React.FC = () => {
  const { toast, alert, confirm } = useDialog();

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

  // Catalogue des clés de licences
  const [catalogueLicences, setCatalogueLicences] = useState<CatalogueLicence[]>([]);
  const [licencePreset, setLicencePreset] = useState<'essai' | 'mois' | 'trimestre' | 'semestre' | 'an'>('mois');
  const [licenceClientCible, setLicenceClientCible] = useState('');
  const [generatingLicence, setGeneratingLicence] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [licenceSearch, setLicenceSearch] = useState('');
  const [licenceStatusFilter, setLicenceStatusFilter] = useState<'all' | 'unused' | 'active' | 'expired'>('all');

  const filteredLicences = useMemo(() => {
    const q = licenceSearch.trim().toLowerCase();
    return catalogueLicences.filter((l) => {
      if (licenceStatusFilter !== 'all' && l.status !== licenceStatusFilter) return false;
      if (q && !l.cle.toLowerCase().includes(q) && !(l.client_cible || '').toLowerCase().includes(q) && !(l.boutique_nom || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [catalogueLicences, licenceSearch, licenceStatusFilter]);

  const generateLicenceKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneratingLicence(true);
    try {
      const newKey = await ownerPost<CatalogueLicence>('/plateforme/licences/generer', {
        preset: licencePreset,
        client_cible: licenceClientCible.trim() || undefined,
      });
      setCatalogueLicences((prev) => [newKey, ...prev]);
      setLicenceClientCible('');
      toast(`Clé ${newKey.cle} générée avec succès !`);
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(newKey.cle);
        setCopiedKey(newKey.cle);
        setTimeout(() => setCopiedKey(null), 3000);
      }
    } catch (err) {
      await alert(err instanceof ApiError ? err.message : 'Échec de la génération de la clé.');
    } finally {
      setGeneratingLicence(false);
    }
  };

  const copyToClipboard = async (cle: string) => {
    try {
      await navigator.clipboard.writeText(cle);
      setCopiedKey(cle);
      toast('Clé copiée dans le presse-papier !');
      setTimeout(() => setCopiedKey(null), 3000);
    } catch {
      toast('Impossible de copier automatiquement.');
    }
  };

  const deleteLicence = async (cle: string) => {
    const ok = await confirm({
      title: 'Supprimer cette clé de licence ?',
      message: `Voulez-vous vraiment supprimer la clé "${cle}" ? Elle ne pourra plus être utilisée.`,
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    try {
      await ownerDelete(`/plateforme/licences/${cle}`);
      setCatalogueLicences((prev) => prev.filter((l) => l.cle !== cle));
      toast('Clé supprimée.');
    } catch (err) {
      await alert(err instanceof ApiError ? err.message : 'Échec de la suppression.');
    }
  };

  const exportAdminsCsv = () => {
    if (boutiques.length === 0) {
      toast('Aucune boutique à exporter.');
      return;
    }
    const headers = [
      'Nom Boutique',
      'Sous-domaine',
      'Statut Boutique',
      'Nom Admin Principal',
      'Username Admin',
      'Email Admin',
      'Téléphone',
      'Clé Licence',
      'Durée Licence',
      'Statut Licence',
      'Jours Restants',
      'Date de Création'
    ];

    const rows = boutiques.map((b) => {
      const status = evaluateLicenceStatus(b.licence);
      return [
        `"${(b.nom || '').replace(/"/g, '""')}"`,
        `"${(b.slug || '').replace(/"/g, '""')}.azanga.tech"`,
        `"${b.status}"`,
        `"${(b.admin_principal?.nom || 'N/A').replace(/"/g, '""')}"`,
        `"${(b.admin_principal?.username || 'N/A').replace(/"/g, '""')}"`,
        `"${(b.admin_principal?.email || 'N/A').replace(/"/g, '""')}"`,
        `"${(b.telephone || 'N/A').replace(/"/g, '""')}"`,
        `"${(b.licence?.cle || 'Aucune').replace(/"/g, '""')}"`,
        `"${b.licence?.duree_jours || 0}j"`,
        `"${status.state}"`,
        `"${status.daysRemaining}j"`,
        `"${new Date(b.created_at).toLocaleDateString('fr-FR')}"`
      ].join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Admins_Boutiques_iVente_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast('Export CSV des administrateurs téléchargé !');
  };

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
      const [b, c, a, t, l] = await Promise.all([
        ownerGet<Boutique[]>('/plateforme/boutiques'),
        ownerGet<{ whatsapp_number: string | null; contact_phone: string | null }>('/plateforme/config'),
        ownerGet<Annonce[]>('/plateforme/annonces'),
        ownerGet<ReceiptTemplate[]>('/plateforme/templates'),
        ownerGet<CatalogueLicence[]>('/plateforme/licences').catch(() => []),
      ]);
      setBoutiques(b);
      setConfig({ whatsapp_number: c.whatsapp_number || '', contact_phone: c.contact_phone || '' });
      setAnnonces(a);
      setTemplates(t);
      setCatalogueLicences(l);
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
      className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 shadow-sm transition-colors"
      title={themeMode === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
    >
      {themeMode === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );

  // ÉCRAN DE CONNEXION ADMIN (100% SOLIDE, STYLE FACEBOOK)
  if (!authed) {
    return (
      <div className="min-h-[100dvh] bg-[#F0F2F5] dark:bg-[#18191A] flex flex-col items-center justify-center p-4 sm:p-6 relative">
        <div className="absolute top-4 right-4">{ThemeToggle}</div>

        <div className="w-full max-w-sm sm:max-w-md bg-white dark:bg-[#242526] rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 transition-colors">
          <div className="flex flex-col items-center text-center gap-3 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-[#1877F2] text-white flex items-center justify-center shadow-lg shadow-blue-500/25">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Espace Propriétaire
              </h1>
              <p className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">
                Connexion d'administration plateforme
              </p>
            </div>
          </div>

          <form onSubmit={submitLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                Mot de passe d'administration
              </label>
              <div className="relative">
                <LockKeyhole className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  autoFocus
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Saisissez votre mot de passe"
                  className="w-full bg-slate-50 dark:bg-[#3A3B3C] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white pl-10 pr-4 py-3.5 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1877F2] focus:border-transparent transition-all min-h-[48px]"
                />
              </div>
            </div>

            {loginError && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold text-center">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loggingIn || !password}
              className="w-full bg-[#1877F2] hover:bg-[#166FE5] disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl text-sm shadow-md active:scale-[0.99] transition-all flex items-center justify-center gap-2 min-h-[48px]"
            >
              {loggingIn ? 'Connexion en cours...' : 'Se connecter'}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
            <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
              iVente Pro Platform · Accès sécurisé par mot de passe dédié
            </p>
          </div>
        </div>
      </div>
    );
  }

  // CONSOLE ADMIN PRINCIPALE (PAGES ET CARTE 100% SOLIDES AVEC MARGES GÉNÉREUSES)
  return (
    <div className="min-h-[100dvh] bg-slate-100 dark:bg-slate-950 py-6 sm:py-10 px-4 sm:px-8 lg:px-12 transition-colors">
      <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8">
        
        {/* En-tête de la Console Admin */}
        <div className="flex items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-500/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight truncate">
                Espace Propriétaire
              </h1>
              <p className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 truncate">
                Gestion multi-boutiques, licences et configuration globale
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {ThemeToggle}
            <button
              type="button"
              onClick={reload}
              disabled={loading}
              className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold transition-all disabled:opacity-50 inline-flex items-center gap-2 shadow-sm"
              title="Actualiser les données"
            >
              <RefreshCw className={`w-4 h-4 text-blue-500 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Actualiser</span>
            </button>
            <button
              type="button"
              onClick={logout}
              className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-xs font-bold transition-all inline-flex items-center gap-2 shadow-sm"
              title="Déconnexion"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </div>

        {/* GESTION ET AGENCEMENT DES BOUTIQUES */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
            <h2 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <Store className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span>Boutiques Enregistrées</span>
              <span className="px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-bold">
                {filteredBoutiques.length} / {boutiques.length}
              </span>
            </h2>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                icon={<Download className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
                onClick={exportAdminsCsv}
                title="Exporter la liste des administrateurs au format CSV"
                className="text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/80 border border-emerald-200 dark:border-emerald-800"
              >
                Exporter Admins (CSV)
              </Button>
              
              <div className="relative flex-1 sm:flex-none">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher une boutique..."
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white pl-9 pr-3 py-2 rounded-xl text-xs font-medium w-full sm:w-52 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as Boutique['status'] | 'all')}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white px-3 py-2 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none shrink-0"
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
            <SolidCard>
              <p className="text-xs font-medium text-slate-400 text-center py-6">
                {boutiques.length === 0 ? 'Aucune boutique enregistrée.' : 'Aucun résultat pour ce filtre.'}
              </p>
            </SolidCard>
          )}

          {/* Grille agencée de manière compacte et ergonomique */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredBoutiques.map((b) => {
              const lb = licenceBadge(b.licence);
              const expanded = expandedIds.has(b.id);
              return (
                <div key={b.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4">
                  {/* En-tête de la Carte */}
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-base text-slate-900 dark:text-white truncate" title={b.nom}>
                        {b.nom}
                      </h3>
                      <a
                        href={`https://${b.slug}.azanga.tech`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400 hover:underline truncate inline-flex items-center gap-1 mt-0.5"
                      >
                        <span>{b.slug}.azanga.tech</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </div>
                    <Badge variant={statusBadge[b.status].variant} size="sm">
                      {statusBadge[b.status].label}
                    </Badge>
                  </div>

                  {/* Profil Admin Principal */}
                  {b.admin_principal ? (
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/70 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 truncate">
                          <Users className="w-4 h-4 text-blue-500 shrink-0" />
                          <span className="truncate">{b.admin_principal.nom}</span>
                        </span>
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300 shrink-0">
                          @{b.admin_principal.username}
                        </span>
                      </div>
                      {b.admin_principal.email && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <a href={`mailto:${b.admin_principal.email}`} className="hover:underline hover:text-blue-500 truncate font-medium">
                            {b.admin_principal.email}
                          </a>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-800 text-[11px] text-slate-400 italic">
                      Aucun admin principal répertorié
                    </div>
                  )}

                  {/* Statuts & Indicateurs Clés */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={lb.variant} size="sm" title={b.licence?.cle}>
                      <KeyRound className="w-3.5 h-3.5" /> {lb.label}
                    </Badge>
                    {b.chiffre_affaires !== null && (
                      <StatChip icon={<Wallet className="w-3.5 h-3.5 text-emerald-500" />}>
                        {formatCfaCompact(b.chiffre_affaires)}
                      </StatChip>
                    )}
                    {b.personnel_count !== null && (
                      <StatChip icon={<Users className="w-3.5 h-3.5 text-blue-500" />}>
                        {b.personnel_count} emp.
                      </StatChip>
                    )}
                    {b.produits_count !== null && (
                      <StatChip icon={<Package className="w-3.5 h-3.5 text-amber-500" />}>
                        {b.produits_count} prod.
                      </StatChip>
                    )}
                  </div>

                  {/* Actions & Détails de la carte */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(b.id)}
                      className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                      <span>{expanded ? 'Masquer' : 'Plus d\'infos'}</span>
                    </button>

                    {(b.status === 'active' || b.status === 'suspended') && (
                      <button
                        type="button"
                        onClick={() => toggleStatus(b)}
                        disabled={togglingId === b.id}
                        className={`text-xs font-bold px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-all disabled:opacity-60 tap-scale ${
                          b.status === 'active'
                            ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/60'
                            : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>{togglingId === b.id ? '...' : b.status === 'active' ? 'Désactiver' : 'Réactiver'}</span>
                      </button>
                    )}
                  </div>

                  {/* Accordéon avec informations secondaires */}
                  {expanded && (
                    <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3 rounded-xl text-xs">
                      {b.telephone && (
                        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span>Contact : <strong>{b.telephone}</strong></span>
                        </div>
                      )}
                      {b.zones_actives !== null && (
                        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          <span>Zones de vente : <strong>{b.zones_actives} zone(s)</strong></span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-[11px]">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>Création : {new Date(b.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* GESTION & GÉNÉRATION DES LICENCES (100% SOLIDE) */}
        <SolidCard className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <h2 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-blue-600 dark:text-blue-400" /> Génération & Catalogue des Licences
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Générez des clés d'abonnement signées (7 jours, 1 mois, 3 mois, 6 mois, 1 an), enregistrez-les en base et suivez quelle boutique les utilise.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold">
              <span className="px-3 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                {catalogueLicences.filter((l) => l.status === 'unused').length} non utilisée(s)
              </span>
              <span className="px-3 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                {catalogueLicences.filter((l) => l.status === 'active').length} active(s)
              </span>
            </div>
          </div>

          {/* Formulaire de génération */}
          <form onSubmit={generateLicenceKey} className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-4">
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" /> Générer une nouvelle clé de licence
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-4 space-y-1">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block">
                  Durée de l'abonnement
                </label>
                <select
                  value={licencePreset}
                  onChange={(e) => setLicencePreset(e.target.value as any)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white px-3 py-2.5 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="essai">7 jours (Essai gratuit)</option>
                  <option value="mois">1 mois (30 jours)</option>
                  <option value="trimestre">3 mois (90 jours)</option>
                  <option value="semestre">6 mois (180 jours)</option>
                  <option value="an">1 an (365 jours - Maximum)</option>
                </select>
              </div>

              <div className="sm:col-span-5 space-y-1">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block">
                  Client / Boutique destinataire (Optionnel)
                </label>
                <input
                  value={licenceClientCible}
                  onChange={(e) => setLicenceClientCible(e.target.value)}
                  placeholder="ex: Boutique Fatou / M. Diallo"
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white px-3 py-2.5 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-3 flex items-end">
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  className="w-full shadow-sm"
                  disabled={generatingLicence}
                  icon={<KeyRound className="w-4 h-4" />}
                >
                  {generatingLicence ? 'Génération...' : 'Générer la clé'}
                </Button>
              </div>
            </div>
          </form>

          {/* Liste & Historique des Licences */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Historique des Clés ({filteredLicences.length} / {catalogueLicences.length})
              </h3>
              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    value={licenceSearch}
                    onChange={(e) => setLicenceSearch(e.target.value)}
                    placeholder="Rechercher clé ou client..."
                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white pl-9 pr-3 py-1.5 rounded-xl text-xs font-medium w-full sm:w-48 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <select
                  value={licenceStatusFilter}
                  onChange={(e) => setLicenceStatusFilter(e.target.value as any)}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white px-3 py-1.5 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none shrink-0"
                >
                  <option value="all">Tous statuts</option>
                  <option value="unused">Non utilisée</option>
                  <option value="active">Active</option>
                  <option value="expired">Expirée</option>
                </select>
              </div>
            </div>

            {filteredLicences.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                {catalogueLicences.length === 0
                  ? 'Aucune clé générée pour le moment.'
                  : 'Aucune clé ne correspond à vos critères de recherche.'}
              </p>
            ) : (
              <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                {filteredLicences.map((lic) => {
                  const isCopied = copiedKey === lic.cle;
                  const statusBadgeVariant =
                    lic.status === 'active' ? 'green' : lic.status === 'unused' ? 'blue' : 'red';
                  const statusLabel =
                    lic.status === 'active'
                      ? 'Active'
                      : lic.status === 'unused'
                      ? 'Non utilisée'
                      : 'Expirée';

                  return (
                    <div
                      key={lic.cle}
                      className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800/80"
                    >
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-black text-sm text-slate-900 dark:text-white tracking-wider">
                            {lic.cle}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(lic.cle)}
                            className="px-2.5 py-1 rounded-lg bg-blue-100 dark:bg-blue-950/60 hover:bg-blue-200 dark:hover:bg-blue-900/80 text-blue-700 dark:text-blue-300 text-xs font-bold transition-colors inline-flex items-center gap-1 tap-scale"
                            title="Copier la clé"
                          >
                            {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                            {isCopied ? 'Copié !' : 'Copier'}
                          </button>
                          <Badge variant={statusBadgeVariant} size="sm">
                            {statusLabel}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {lic.preset_label}
                          </span>
                          {lic.client_cible && (
                            <span>Destinataire : <strong>{lic.client_cible}</strong></span>
                          )}
                          {lic.status === 'active' && lic.boutique_nom && (
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                              Utilisée par : {lic.boutique_nom} {lic.boutique_slug ? `(${lic.boutique_slug}.azanga.tech)` : ''}
                            </span>
                          )}
                          <span>
                            Générée le {new Date(lic.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {lic.activated_at && (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              Activée le {new Date(lic.activated_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                            </span>
                          )}
                        </div>
                      </div>

                      {lic.status === 'unused' && (
                        <button
                          type="button"
                          onClick={() => deleteLicence(lic.cle)}
                          className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors p-2 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 self-end sm:self-center shrink-0 tap-scale"
                          title="Supprimer cette clé"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </SolidCard>

        {/* GRILLE SECONDAIRE : RÉGLAGES & DIFFUSION */}
        <div className="grid md:grid-cols-2 gap-6">

          {/* Réglages globaux */}
          <SolidCard>
            <h2 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2 mb-4">
              <Settings2 className="w-5 h-5 text-blue-600 dark:text-blue-400" /> Réglages Globaux Plateforme
            </h2>
            <form onSubmit={saveConfig} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">
                  Numéro WhatsApp (format international sans "+")
                </label>
                <input
                  value={config.whatsapp_number}
                  onChange={(e) => setConfig((c) => ({ ...c, whatsapp_number: e.target.value }))}
                  placeholder="226XXXXXXXXX"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white px-4 py-2.5 rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">
                  Téléphone de contact support (optionnel)
                </label>
                <input
                  value={config.contact_phone}
                  onChange={(e) => setConfig((c) => ({ ...c, contact_phone: e.target.value }))}
                  placeholder="+226 XX XX XX XX"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white px-4 py-2.5 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <Button type="submit" variant="primary" size="md" disabled={savingConfig}>
                {savingConfig ? 'Enregistrement...' : 'Enregistrer les réglages'}
              </Button>
            </form>
          </SolidCard>

          {/* Diffusion d'Annonces */}
          <SolidCard>
            <h2 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2 mb-1">
              <Megaphone className="w-5 h-5 text-blue-600 dark:text-blue-400" /> Diffusion d'Annonces
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Diffuse un message dans la cloche de notifications des administrateurs ciblés.
            </p>
            <form onSubmit={sendAnnonce} className="space-y-4">
              <select
                value={annonceTarget}
                onChange={(e) => setAnnonceTarget(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white px-4 py-2.5 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
                placeholder="Saisissez le message de l'annonce..."
                rows={3}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white px-4 py-2.5 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
              />
              <Button type="submit" variant="primary" size="md" icon={<Send className="w-4 h-4" />} disabled={sendingAnnonce || !annonceMessage.trim()}>
                {sendingAnnonce ? 'Envoi...' : 'Envoyer l\'annonce'}
              </Button>
            </form>
          </SolidCard>
        </div>

        {/* Historique des Annonces */}
        <SolidCard>
          <h2 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2 mb-4">
            <History className="w-5 h-5 text-blue-600 dark:text-blue-400" /> Historique des Annonces Envoyées
          </h2>
          {annonces.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">Aucune annonce envoyée pour l'instant.</p>
          ) : (
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {annonces.map((a) => (
                <div key={a.id} className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-medium text-slate-800 dark:text-slate-200 leading-relaxed">{a.message}</p>
                    <span className="text-[10px] font-semibold text-slate-400 shrink-0">
                      {new Date(a.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    {a.target_label} · Envoyé à {a.sent_count} boutique(s){a.failed_count ? `, ${a.failed_count} échec(s)` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </SolidCard>

        {/* Templates de reçus A4 (Gestion globale) */}
        <SolidCard>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" /> Modèles de Reçus et Factures A4
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Modèles HTML d'impression A4 mis à disposition des boutiques de la plateforme.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadStarterTemplate}
                className="px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-100 text-xs font-bold transition-all inline-flex items-center gap-1.5 shadow-sm"
                title="Télécharger un modèle HTML exemple valide"
              >
                <Download className="w-4 h-4" /> Modèle Exemple (.html)
              </button>
              <button
                type="button"
                onClick={() => setShowGuide((v) => !v)}
                className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 text-xs font-bold transition-all inline-flex items-center gap-1.5 shadow-sm"
              >
                <HelpCircle className="w-4 h-4 text-blue-500" /> Guide Balises
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
                className="cursor-pointer px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all inline-flex items-center gap-1.5 shadow-md"
              >
                + Importer un Modèle (.html)
              </label>
            </div>
          </div>

          {/* Guide des balises (accordéon) */}
          {showGuide && (
            <div className="p-4 mb-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs space-y-3">
              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-sm">
                <HelpCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" /> Documentation du moteur de reçus HTML
              </div>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                Pour créer un modèle compatible, utilisez un fichier <code>.html</code> encodé en UTF-8. 
                Le serveur nettoie automatiquement les liens Google Fonts distants et force la mise en page A4.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="font-bold text-blue-600 dark:text-blue-400">&#123;boutique&#125;</span> : Nom du magasin
                </div>
                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="font-bold text-blue-600 dark:text-blue-400">&#123;client&#125;</span> : Nom du client
                </div>
                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="font-bold text-blue-600 dark:text-blue-400">&#123;ref&#125;</span> : Réf / Numéro facture
                </div>
                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="font-bold text-blue-600 dark:text-blue-400">&#123;date&#125;</span> : Date de vente
                </div>
                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="font-bold text-blue-600 dark:text-blue-400">&#123;total&#125;</span> : Montant net à payer
                </div>
                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="font-bold text-blue-600 dark:text-blue-400">&#123;paye&#125;</span> : Montant encaissé
                </div>
              </div>
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300">
                <strong>Bloc articles obligatoire :</strong> Entourez les lignes du tableau avec <code>&lt;!--ITEMS--&gt; ... &lt;!--/ITEMS--&gt;</code>. 
                Balises d'articles disponibles : <code>&#123;item_index&#125;</code>, <code>&#123;item_nom&#125;</code>, <code>&#123;item_attributs&#125;</code>, <code>&#123;item_qte&#125;</code>, <code>&#123;item_prix_unitaire&#125;</code>, <code>&#123;item_total&#125;</code>.
              </div>
            </div>
          )}

          {templates.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8 px-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
              Aucun modèle ajouté pour le moment.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {templates.map(t => {
                const isPreviewing = previewingTemplateId === t.id;
                return (
                  <div key={t.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex flex-col justify-between space-y-3">
                    <div>
                      <div className="font-bold text-sm text-slate-900 dark:text-white mb-1 truncate">{t.nom}</div>
                      <div className="text-[11px] font-medium text-slate-500 truncate">{t.description}</div>
                    </div>
                    <div className="flex justify-between items-center pt-3 border-t border-slate-200 dark:border-slate-700">
                      <button
                        type="button"
                        disabled={isPreviewing}
                        onClick={() => handlePreviewTemplate(t.id, t.nom)}
                        className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 disabled:opacity-50"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{isPreviewing ? 'Génération...' : 'Aperçu PDF'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTemplate(t.id, t.nom)}
                        className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SolidCard>

      </div>
    </div>
  );
};
