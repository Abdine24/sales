import React, { useCallback, useState, useEffect } from 'react';
import {
  Building2,
  Image,
  Mail,
  MapPin,
  Plus,
  Save,
  Trash2,
  Printer,
  Volume2,
  VolumeX,
  FileText,
  Receipt,
  Check,
  MessageSquare,
  Sparkles,
  Smartphone,
} from 'lucide-react';
import type { AppSettings, Zone, Produit, Personnel as PersonnelRecord } from '../db/db';
import { apiGet, apiPut, apiPost, apiDelete, ApiError } from '../services/api';
import { GlassCard } from '../components/ui/GlassCard';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { useDialog } from '../components/ui/DialogProvider';
import { LicenceSection } from '../components/LicenceSection';
import { playScanBeep } from '../utils/barcode';

const DEFAULT_SETTINGS: AppSettings = { id: 'principale', nom_site: 'iVente Pro' };

export const Settings: React.FC = () => {
  const { confirm, alert } = useDialog();
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loading, setLoading] = useState(true);

  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [zones, setZones] = useState<Zone[]>([]);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [personnel, setPersonnel] = useState<PersonnelRecord[]>([]);

  const reload = useCallback(async () => {
    try {
      const [s, z, p, pers] = await Promise.all([
        apiGet<AppSettings>('/settings'),
        apiGet<Zone[]>('/zones'),
        apiGet<Produit[]>('/produits'),
        apiGet<PersonnelRecord[]>('/personnel'),
      ]);
      setSettingsState(s || DEFAULT_SETTINGS);
      setZones(z);
      setProduits(p);
      setPersonnel(pers);
    } catch (err) {
      await alert(err instanceof ApiError ? err.message : 'Impossible de charger les réglages.');
    } finally {
      setLoading(false);
    }
  }, [alert]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Identity Form State
  const [nomSite, setNomSite] = useState('');
  const [slogan, setSlogan] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');
  const [ifu, setIfu] = useState('');
  const [rrcm, setRrcm] = useState('');
  const [localite, setLocalite] = useState('');

  // Ticket & Print Settings State
  const [printFormatDefault, setPrintFormatDefault] = useState<'thermique' | 'a4'>('thermique');
  const [ticketShowLogo, setTicketShowLogo] = useState(true);
  const [ticketShowVendeur, setTicketShowVendeur] = useState(true);
  const [ticketShowAdresse, setTicketShowAdresse] = useState(true);
  const [ticketShowIfu, setTicketShowIfu] = useState(true);
  const [ticketShowQrcode, setTicketShowQrcode] = useState(true);
  const [ticketFooterMessage, setTicketFooterMessage] = useState('Merci de votre visite !');

  // WhatsApp Settings State
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [whatsappAutoOpen, setWhatsappAutoOpen] = useState(false);
  const [whatsappCustomMessage, setWhatsappCustomMessage] = useState(
    'Bonjour {client}, toute notre équipe vous remercie chaleureusement pour votre fidélité et votre confiance ! ✨'
  );

  // Audio / Beep State
  const [soundEnabled, setSoundEnabled] = useState(true);

  useEffect(() => {
    if (settings) {
      setNomSite(settings.nom_site || 'iVente Pro');
      setSlogan(settings.slogan || '');
      setLogoUrl(settings.logo_url || '');
      setEmail(settings.email || '');
      setTelephone(settings.telephone || '');
      setIfu(settings.ifu || '');
      setRrcm(settings.rrcm || '');
      setLocalite(settings.localite || '');

      setPrintFormatDefault(settings.print_format_default || 'thermique');
      setTicketShowLogo(settings.ticket_show_logo !== false);
      setTicketShowVendeur(settings.ticket_show_vendeur !== false);
      setTicketShowAdresse(settings.ticket_show_adresse !== false);
      setTicketShowIfu(settings.ticket_show_ifu !== false);
      setTicketShowQrcode(settings.ticket_show_qrcode !== false);
      setTicketFooterMessage(settings.ticket_footer_message || 'Merci de votre visite !');

      setWhatsappEnabled(Boolean(settings.whatsapp_enabled));
      setWhatsappAutoOpen(Boolean(settings.whatsapp_auto_open));
      setWhatsappCustomMessage(
        settings.whatsapp_custom_message ||
        'Bonjour {client}, toute notre équipe vous remercie chaleureusement pour votre fidélité et votre confiance ! ✨'
      );

      const isSound = settings.sound_enabled !== false;
      setSoundEnabled(isSound);
      localStorage.setItem('app_sound_enabled', String(isSound));
    }
  }, [settings]);

  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    const updated: AppSettings = {
      id: 'principale',
      nom_site: nomSite.trim() || 'iVente Pro',
      slogan: slogan.trim(),
      logo_url: logoUrl.trim(),
      email: email.trim(),
      telephone: telephone.trim(),
      ifu: ifu.trim(),
      rrcm: rrcm.trim(),
      localite: localite.trim(),

      print_format_default: printFormatDefault,
      ticket_show_logo: ticketShowLogo,
      ticket_show_vendeur: ticketShowVendeur,
      ticket_show_adresse: ticketShowAdresse,
      ticket_show_ifu: ticketShowIfu,
      ticket_show_qrcode: ticketShowQrcode,
      ticket_footer_message: ticketFooterMessage.trim(),

      whatsapp_enabled: whatsappEnabled,
      whatsapp_auto_open: whatsappAutoOpen,
      whatsapp_custom_message: whatsappCustomMessage.trim(),

      sound_enabled: soundEnabled,
    };

    localStorage.setItem('app_sound_enabled', String(soundEnabled));
    try {
      const saved = await apiPut<AppSettings>('/settings', updated);
      setSettingsState(saved);
      window.dispatchEvent(new Event('app-settings-updated'));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      await alert(err instanceof ApiError ? err.message : "Échec de l'enregistrement des paramètres.");
    }
  };

  const handleTestBeep = () => {
    if (!soundEnabled) {
      alert({
        title: 'Son désactivé',
        message: 'Le son de caisse est actuellement désactivé. Activez-le pour entendre le bip.',
      });
      return;
    }
    playScanBeep(true);
  };

  // Zones Management
  const [zoneModalOpen, setZoneModalOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [zoneNom, setZoneNom] = useState('');
  const [zoneCode, setZoneCode] = useState('');

  const openZone = (zone?: Zone) => {
    setEditingZone(zone || null);
    setZoneNom(zone?.nom || '');
    setZoneCode(zone?.code || '');
    setZoneModalOpen(true);
  };

  const saveZone = async (event: React.FormEvent) => {
    event.preventDefault();
    const code = zoneCode.trim().toUpperCase();
    if (!zoneNom.trim() || !code) return;
    const duplicate = zones.some((zone) => zone.code === code && zone.id !== editingZone?.id);
    if (duplicate) return;
    try {
      if (editingZone?.id) {
        await apiPut(`/zones/${editingZone.id}`, { nom: zoneNom.trim(), code });
      } else {
        await apiPost('/zones', { nom: zoneNom.trim(), code, actif: true });
      }
      setZoneModalOpen(false);
      await reload();
    } catch (err) {
      await alert(err instanceof ApiError ? err.message : "Échec de l'enregistrement de la boutique.");
    }
  };

  const deleteZone = async (zone: Zone) => {
    const used =
      produits.some((produit) => produit.zone_id === zone.id) ||
      personnel.some((person) => person.zone_id === zone.id);
    if (used) {
      await alert('Cette zone est utilisée par des produits ou des membres du personnel.');
      return;
    }
    if (!zone.id) return;
    const ok = await confirm({
      title: 'Supprimer le magasin',
      message: `Supprimer « ${zone.nom} » ?`,
      danger: true,
      confirmLabel: 'Supprimer',
    });
    if (!ok) return;
    try {
      await apiDelete(`/zones/${zone.id}`);
      await reload();
    } catch (err) {
      await alert(err instanceof ApiError ? err.message : 'Échec de la suppression.');
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-sm text-slate-400">Chargement…</div>;
  }

  return (
    <div className="space-y-6 max-w-6xl pb-10">
      <div>
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Paramètres Généraux
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Configuration de votre boutique, personnalisation des reçus, WhatsApp fidélité et licence.
        </p>
      </div>

      <form onSubmit={saveSettings} className="space-y-6">
        {/* 1. IDENTITÉ DU MAGASIN */}
        <GlassCard>
          <div className="flex items-center gap-2 mb-5 pb-3 border-b border-slate-200/50 dark:border-white/10">
            <Building2 className="w-5 h-5 text-blue-500" />
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              Identité de l'Établissement & Coordonnées
            </h3>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 block">
                Nom du magasin / Enseigne *
              </label>
              <input
                required
                value={nomSite}
                onChange={(event) => setNomSite(event.target.value)}
                className="w-full glass-input px-4 py-2.5 rounded-xl text-sm font-semibold"
                placeholder="Ex: iVente Apple Store"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 block">
                Slogan commercial
              </label>
              <input
                value={slogan}
                onChange={(event) => setSlogan(event.target.value)}
                className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                placeholder="Ex: Le spécialiste Apple & High-Tech"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 block">
                Email de contact
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full glass-input pl-10 pr-4 py-2.5 rounded-xl text-sm"
                  placeholder="contact@boutique.com"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 block">
                Téléphone service client / WhatsApp
              </label>
              <input
                value={telephone}
                onChange={(event) => setTelephone(event.target.value)}
                className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                placeholder="+229 97 00 00 00"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 block">
                Localité / Adresse physique
              </label>
              <input
                value={localite}
                onChange={(event) => setLocalite(event.target.value)}
                className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                placeholder="Ex: Cotonou, Haie Vive, Rue 340"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 block">
                Numéro IFU (Identifiant Fiscal Unique)
              </label>
              <input
                value={ifu}
                onChange={(event) => setIfu(event.target.value)}
                className="w-full glass-input px-4 py-2.5 rounded-xl text-sm font-mono"
                placeholder="Ex: 320XXXXXXXXX"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 block">
                Numéro RCCM (Registre de Commerce)
              </label>
              <input
                value={rrcm}
                onChange={(event) => setRrcm(event.target.value)}
                className="w-full glass-input px-4 py-2.5 rounded-xl text-sm font-mono"
                placeholder="Ex: RB/COT/21 B 12345"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 block">
                URL du Logo officiel
              </label>
              <div className="relative flex items-center gap-2">
                <div className="relative flex-1">
                  <Image className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <input
                    value={logoUrl}
                    onChange={(event) => setLogoUrl(event.target.value)}
                    className="w-full glass-input pl-10 pr-4 py-2.5 rounded-xl text-sm"
                    placeholder="https://.../logo.png ou data:image/..."
                  />
                </div>
                {logoUrl && (
                  <img
                    src={logoUrl}
                    alt="Logo"
                    className="h-10 w-10 object-contain rounded-xl border border-slate-200/80 dark:border-white/10 p-0.5 bg-white shrink-0"
                  />
                )}
              </div>
            </div>
          </div>
        </GlassCard>

        {/* 2. FORMAT D'IMPRESSION & PERSONNALISATION DES TICKETS DE CAISSE */}
        <GlassCard>
          <div className="flex items-center gap-2 mb-5 pb-3 border-b border-slate-200/50 dark:border-white/10">
            <Printer className="w-5 h-5 text-purple-500" />
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Format d'Impression & Options du Ticket de Caisse
              </h3>
              <p className="text-xs text-slate-400">
                Définissez le format par défaut et personnalisez les éléments imprimés sur chaque reçu.
              </p>
            </div>
          </div>

          {/* Choix du format par défaut */}
          <div className="mb-6">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2.5 block">
              Format d'impression par défaut en caisse
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label
                className={`relative flex items-center gap-3.5 p-4 rounded-2xl border cursor-pointer transition-all ${printFormatDefault === 'thermique'
                  ? 'border-purple-500 bg-purple-500/10 shadow-sm'
                  : 'border-slate-200/80 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
              >
                <input
                  type="radio"
                  name="printFormat"
                  value="thermique"
                  checked={printFormatDefault === 'thermique'}
                  onChange={() => setPrintFormatDefault('thermique')}
                  className="sr-only"
                />
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${printFormatDefault === 'thermique'
                    ? 'bg-purple-500 text-white shadow-md'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                    }`}
                >
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    Rouleau Thermique (80mm / 58mm)
                    {printFormatDefault === 'thermique' && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500 text-white">
                        Recommandé
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Ticket compact pour imprimantes thermiques de caisse (POS USB / Bluetooth).
                  </p>
                </div>
              </label>

              <label
                className={`relative flex items-center gap-3.5 p-4 rounded-2xl border cursor-pointer transition-all ${printFormatDefault === 'a4'
                  ? 'border-blue-500 bg-blue-500/10 shadow-sm'
                  : 'border-slate-200/80 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
              >
                <input
                  type="radio"
                  name="printFormat"
                  value="a4"
                  checked={printFormatDefault === 'a4'}
                  onChange={() => setPrintFormatDefault('a4')}
                  className="sr-only"
                />
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${printFormatDefault === 'a4'
                    ? 'bg-blue-500 text-white shadow-md'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                    }`}
                >
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    Facture A4 Standard
                    {printFormatDefault === 'a4' && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500 text-white">
                        Format Bureautique
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Mise en page pleine page A4 pour imprimantes laser ou jet d'encre standard.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Cases à cocher pour afficher/masquer sur le ticket */}
          <div className="pt-4 border-t border-slate-200/60 dark:border-white/10">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-3 block">
              Éléments visibles sur le ticket de caisse
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
              <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200/80 dark:border-white/10 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={ticketShowLogo}
                  onChange={(e) => setTicketShowLogo(e.target.checked)}
                  className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Logo de la boutique
                </span>
              </label>

              <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200/80 dark:border-white/10 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={ticketShowVendeur}
                  onChange={(e) => setTicketShowVendeur(e.target.checked)}
                  className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Nom du caissier / vendeur
                </span>
              </label>

              <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200/80 dark:border-white/10 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={ticketShowAdresse}
                  onChange={(e) => setTicketShowAdresse(e.target.checked)}
                  className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Adresse & Téléphone
                </span>
              </label>

              <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200/80 dark:border-white/10 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={ticketShowIfu}
                  onChange={(e) => setTicketShowIfu(e.target.checked)}
                  className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Numéros IFU & RCCM
                </span>
              </label>

              <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200/80 dark:border-white/10 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={ticketShowQrcode}
                  onChange={(e) => setTicketShowQrcode(e.target.checked)}
                  className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Référence / Code QR du reçu
                </span>
              </label>
            </div>
          </div>

          {/* Message de bas de ticket */}
          <div className="mt-4 pt-4 border-t border-slate-200/60 dark:border-white/10">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">
              Message personnalisé de bas de ticket (Pied de page)
            </label>
            <input
              type="text"
              value={ticketFooterMessage}
              onChange={(e) => setTicketFooterMessage(e.target.value)}
              placeholder="Ex: Merci de votre visite ! Les articles achetés ne sont ni repris ni échangés."
              className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
            />
          </div>
        </GlassCard>

        {/* 3. REÇUS WHATSAPP & REMERCIEMENT FIDÉLITÉ */}
        <GlassCard>
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/50 dark:border-white/10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  Reçus & Messages de Fidélité WhatsApp
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    Nouveau
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  Envoyez automatiquement un message de remerciement et le reçu détaillé par WhatsApp au client.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4 mt-4">
            {/* Activation WhatsApp */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-900/40 border border-slate-200/70 dark:border-white/10">
              <div>
                <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  Activer les reçus WhatsApp après chaque vente
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Affiche le bouton WhatsApp lors de l'encaissement si le client dispose d'un numéro de téléphone.
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={whatsappEnabled}
                  onChange={(e) => setWhatsappEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-12 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>

            {whatsappEnabled && (
              <>
                {/* Auto open toggle */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-500/20">
                  <div>
                    <div className="font-bold text-sm text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
                      Ouverture automatique de WhatsApp
                    </div>
                    <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
                      Ouvre directement WhatsApp (Web ou App) dès la validation du paiement pour envoyer le message en 1 clic.
                    </p>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={whatsappAutoOpen}
                      onChange={(e) => setWhatsappAutoOpen(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-12 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                {/* Custom Message input */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Message personnalisé WhatsApp & Balises dynamiques
                    </label>
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                      Accompagné de la Facture A4 (PDF)
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {[
                      { tag: '{client}', desc: 'Nom du client' },
                      { tag: '{produit}', desc: 'Détail des articles & remises' },
                      { tag: '{total}', desc: 'Montant total' },
                      { tag: '{remise}', desc: 'Montant remise' },
                      { tag: '{paye}', desc: 'Montant réglé' },
                      { tag: '{reste}', desc: 'Reste à payer' },
                      { tag: '{boutique}', desc: 'Nom magasin' },
                      { tag: '{date}', desc: 'Date d\'achat' },
                      { tag: '{ref}', desc: 'Réf ticket' },
                    ].map((item) => (
                      <button
                        key={item.tag}
                        type="button"
                        onClick={() => setWhatsappCustomMessage((prev) => `${prev} ${item.tag}`)}
                        className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 transition-all"
                        title={item.desc}
                      >
                        + {item.tag}
                      </button>
                    ))}
                  </div>

                  <textarea
                    rows={4}
                    value={whatsappCustomMessage}
                    onChange={(e) => setWhatsappCustomMessage(e.target.value)}
                    placeholder="Bonjour {client}, merci pour votre fidélité chez {boutique} ! Voici votre commande : {produit} ..."
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Insérez <code>&#123;client&#125;</code> pour le nom du client et <code>&#123;produit&#125;</code> pour placer la liste des articles avec leurs prix et remises.
                  </p>
                </div>
              </>
            )}
          </div>
        </GlassCard>

        {/* 4. PRÉFÉRENCES SONORES & CAISSE */}
        <GlassCard>
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/50 dark:border-white/10">
            <div className="flex items-center gap-2">
              {soundEnabled ? (
                <Volume2 className="w-5 h-5 text-emerald-500" />
              ) : (
                <VolumeX className="w-5 h-5 text-slate-400" />
              )}
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Bip Sonore de Caisse & Scanner
                </h3>
                <p className="text-xs text-slate-400">
                  Signal audio lors du scan d'un code-barres et de la validation d'une vente.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="glass"
                size="sm"
                onClick={handleTestBeep}
                icon={<Volume2 className="w-3.5 h-3.5 text-emerald-500" />}
              >
                Tester le bip
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-900/40 border border-slate-200/70 dark:border-white/10">
            <div>
              <div className="font-bold text-sm text-slate-900 dark:text-white">
                Activer les effets sonores
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Émet un bip aigu franc à chaque scan réussi et à chaque encaissement.
              </p>
            </div>

            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => {
                  setSoundEnabled(e.target.checked);
                  localStorage.setItem('app_sound_enabled', String(e.target.checked));
                }}
                className="sr-only peer"
              />
              <div className="w-12 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>
        </GlassCard>

        {/* Bouton de sauvegarde global */}
        <div className="flex items-center justify-end gap-3 sticky bottom-4 z-20 py-2">
          {saveSuccess && (
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 rounded-xl flex items-center gap-1.5 animate-pulse">
              <Check className="w-4 h-4" /> Paramètres enregistrés avec succès !
            </span>
          )}
          <Button type="submit" variant="primary" size="lg" icon={<Save className="w-4 h-4" />}>
            Enregistrer tous les paramètres
          </Button>
        </div>
      </form>

      {/* 5. MULTI-MAGASINS / ZONES */}
      <GlassCard className="p-0 overflow-hidden">
        <div className="p-5 flex items-center justify-between border-b border-slate-200/50 dark:border-white/10">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-emerald-500" />
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Magasins & Points de Vente (Zones)
              </h3>
              <p className="text-xs text-slate-400">
                Organisez vos stocks et vos caissiers par boutique ou zone géographique.
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => openZone()}
          >
            Ajouter une boutique
          </Button>
        </div>

        <div className="divide-y divide-slate-200/40 dark:divide-white/5">
          {zones.map((zone) => {
            const countDispo = produits.filter(
              (produit) => !produit.zone_id || produit.zone_id === zone.id
            ).length;
            const countSpecific = produits.filter((produit) => produit.zone_id === zone.id).length;
            const countStaff = personnel.filter(
              (person) => person.principal || person.zone_id === zone.id || !person.zone_id
            ).length;

            return (
              <div key={zone.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                <div>
                  <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    {zone.nom}
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      {zone.code}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {countDispo} produit(s) en catalogue ({countSpecific} exclusif{countSpecific > 1 ? 's' : ''}) · {countStaff} membre(s) du personnel
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="glass" size="sm" onClick={() => openZone(zone)}>
                    Modifier
                  </Button>
                  <button
                    onClick={() => deleteZone(zone)}
                    className="p-2 rounded-xl glass-card text-rose-500 hover:bg-rose-500/10 transition-colors"
                    title="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* 6. LICENCE, ABONNEMENT & VERSION DE L'APPLICATION */}
      <LicenceSection />

      {/* La sauvegarde/restauration locale (.json) a été retirée : elle exportait Dexie/IndexedDB,
          qui ne contient plus les données de la boutique (tout vit sur le serveur maintenant).
          Une vraie sauvegarde reviendra plus tard côté serveur (dump programmé de Postgres). */}

      {/* MODAL: Ajout / Édition d'une Zone */}
      <Modal
        isOpen={zoneModalOpen}
        onClose={() => setZoneModalOpen(false)}
        title={editingZone ? 'Modifier la boutique / zone' : 'Ajouter une boutique / zone'}
      >
        <form onSubmit={saveZone} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 block">
              Nom du point de vente
            </label>
            <input
              required
              value={zoneNom}
              onChange={(event) => setZoneNom(event.target.value)}
              placeholder="Ex: Boutique Haie Vive"
              className="w-full glass-input px-4 py-2.5 rounded-xl text-sm font-semibold"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 block">
              Code identifiant
            </label>
            <input
              required
              value={zoneCode}
              onChange={(event) => setZoneCode(event.target.value)}
              placeholder="Ex: MAG-02"
              className="w-full glass-input px-4 py-2.5 rounded-xl text-sm font-mono font-bold uppercase"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setZoneModalOpen(false)}>
              Annuler
            </Button>
            <Button variant="primary" type="submit">
              Enregistrer
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
