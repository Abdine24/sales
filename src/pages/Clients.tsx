import React, { useCallback, useEffect, useState } from 'react';
import {
  Users,
  UserPlus,
  Search,
  DollarSign,
  Phone,
  Mail,
  Edit2,
  Trash2,
  CheckCircle2,
  Printer,
  Download,
  MessageSquare,
  History,
  FileText,
  Calendar,
  UserCheck,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';
import type { Client, Vente, LigneVente, Reglement, AppSettings } from '../db/db';
import { apiGet, apiPost, apiPut, apiDelete, ApiError } from '../services/api';
import { GlassCard } from '../components/ui/GlassCard';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { useDialog } from '../components/ui/DialogProvider';
import { ReceiptPrint, ReceiptData, ReceiptFormat } from '../components/ReceiptPrint';
import { formatCfa, parseAmount } from '../utils/currency';
import { openWhatsAppReceipt, openWhatsAppDebtReceipt } from '../utils/whatsapp';
import { generateReceiptPdf, generateDebtReceiptA4Pdf, printReceiptA4 } from '../utils/pdfInvoice';

interface ClientsProps {
  activeZoneId?: number | null;
  vendeur?: { id?: number; nom: string; identifiant: string };
}

export const Clients: React.FC<ClientsProps> = ({ activeZoneId, vendeur }) => {
  const { confirm, alert } = useDialog();
  const [clients, setClients] = useState<Client[]>([]);
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [lignesVente, setLignesVente] = useState<LigneVente[]>([]);
  const [reglements, setReglements] = useState<Reglement[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [c, v, l, r, s] = await Promise.all([
        apiGet<Client[]>('/clients'),
        apiGet<Vente[]>('/ventes'),
        apiGet<LigneVente[]>('/ventes/lignes/all'),
        apiGet<Reglement[]>('/reglements'),
        apiGet<AppSettings>('/settings'),
      ]);
      setClients(c);
      setVentes(v);
      setLignesVente(l);
      setReglements(r);
      setSettings(s);
    } catch (err) {
      await alert(err instanceof ApiError ? err.message : 'Impossible de charger les clients.');
    } finally {
      setLoading(false);
    }
  }, [alert]);

  useEffect(() => {
    reload();
  }, [reload]);

  const [activeMainTab, setActiveMainTab] = useState<'clients' | 'reglements'>('clients');
  const [search, setSearch] = useState('');
  const [reglementSearch, setReglementSearch] = useState('');
  const [historyClient, setHistoryClient] = useState<Client | null>(null);
  const [historyTab, setHistoryTab] = useState<'ventes' | 'reglements'>('ventes');
  const [selectedReceiptSale, setSelectedReceiptSale] = useState<Vente | null>(null);
  const [selectedReceiptReglement, setSelectedReceiptReglement] = useState<Reglement | null>(null);
  const [receiptFormat, setReceiptFormat] = useState<ReceiptFormat>('thermique');

  React.useEffect(() => {
    if (settings?.print_format_default) {
      setReceiptFormat(settings.print_format_default);
    }
  }, [settings?.print_format_default]);

  // En A4, imprime le MÊME PDF que le bouton "Télécharger PDF" — jamais le ticket rouleau étiré
  // en A4 par le CSS. Ne concerne que les reçus de VENTE : un reçu de règlement de créance
  // (selectedReceiptReglement) n'a pas de facture, il garde l'impression HTML.
  const handlePrintReceipt = async () => {
    if (receiptFormat !== 'a4' || !selectedReceiptSale) {
      window.print();
      return;
    }
    try {
      await printReceiptA4({
        vente: selectedReceiptSale,
        lignes: lignesVente
          .filter((ligne) => ligne.vente_id === selectedReceiptSale.id)
          .map((l) => ({
            nom: l.produit_nom,
            variante: l.variante,
            quantite: l.quantite,
            prix_unitaire: l.prix_unitaire,
          })),
        clientNom: selectedReceiptSale.client_nom || historyClient?.nom,
        settings,
      });
    } catch (e) {
      await alert({ title: 'Impression A4 impossible', message: (e as Error).message });
    }
  };

  // Add / Edit Client Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [nom, setNom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [email, setEmail] = useState('');

  // Payment Record Modal
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [payingClient, setPayingClient] = useState<Client | null>(null);
  const [reglementAmount, setReglementAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<'especes' | 'mobile_money' | 'virement'>('especes');
  const [paymentNote, setPaymentNote] = useState('');

  const handleOpenAddModal = () => {
    setEditingClient(null);
    setNom('');
    setTelephone('');
    setEmail('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (c: Client) => {
    setEditingClient(c);
    setNom(c.nom);
    setTelephone(c.telephone);
    setEmail(c.email || '');
    setIsModalOpen(true);
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nom || !telephone) return;

    try {
      if (editingClient?.id) {
        await apiPut(`/clients/${editingClient.id}`, { nom, telephone, email });
      } else {
        await apiPost('/clients', { nom, telephone, email, total_dette: 0 });
      }
      setIsModalOpen(false);
      await reload();
    } catch (err) {
      await alert(err instanceof ApiError ? err.message : "Échec de l'enregistrement du client.");
    }
  };

  const handleDeleteClient = async (id: number) => {
    const ok = await confirm({
      title: 'Supprimer le client',
      message: 'Voulez-vous vraiment supprimer ce client ? Son historique de créances sera perdu.',
      danger: true,
      confirmLabel: 'Supprimer',
    });
    if (!ok) return;
    try {
      await apiDelete(`/clients/${id}`);
      await reload();
    } catch (err) {
      await alert(err instanceof ApiError ? err.message : 'Échec de la suppression.');
    }
  };

  // Open Payment modal
  const handleOpenPaymentModal = (c: Client) => {
    setPayingClient(c);
    setReglementAmount(c.total_dette.toString());
    setPaymentMode('especes');
    setPaymentNote('');
    setIsPaymentModalOpen(true);
  };

  // Confirm payment settlement — le serveur calcule dette_avant/dette_apres et ajuste la
  // dette du client dans une seule transaction (voir server/src/routes/reglements.js).
  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingClient || !payingClient.id || !reglementAmount) return;

    const amountPaid = parseAmount(reglementAmount);
    if (amountPaid <= 0) {
      await alert('Veuillez saisir un montant supérieur à 0.');
      return;
    }

    try {
      const reglementSaved = await apiPost<Reglement>('/reglements', {
        client_id: payingClient.id,
        client_nom: payingClient.nom,
        montant: amountPaid,
        mode_paiement: paymentMode,
        vendeur_id: vendeur?.id ?? null,
        vendeur_nom: vendeur?.nom || 'Caissier',
        vendeur_identifiant: vendeur?.identifiant,
        zone_id: activeZoneId ?? null,
        type: 'paiement_dette',
        note: paymentNote.trim() || undefined,
      });

      setIsPaymentModalOpen(false);
      setPayingClient(null);
      await reload();

      // Ouvre le reçu du règlement
      setSelectedReceiptReglement(reglementSaved);
    } catch (err) {
      await alert(err instanceof ApiError ? err.message : "Échec de l'enregistrement du règlement.");
    }
  };

  const exportClientsCSV = () => {
    const header = ['Nom', 'Téléphone', 'Email', 'Créances (F)'].join(',');
    const rows = clients.map((c) => [
      `"${c.nom.replace(/"/g, '""')}"`,
      `"${c.telephone}"`,
      `"${c.email || ''}"`,
      c.total_dette,
    ].join(','));
    const csvContent = [header, ...rows].join('\n');
    const blob = new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), csvContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `clients_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportReglementsCSV = () => {
    const header = ['Date', 'Client', 'Type', 'Montant (F)', 'Mode', 'Encaissé par', 'Dette après (F)', 'Note'].join(',');
    const rows = reglements.map((r) => [
      `"${new Date(r.date).toLocaleString('fr-FR')}"`,
      `"${r.client_nom.replace(/"/g, '""')}"`,
      `"${r.type === 'remboursement_retour' ? 'Remboursement retour' : 'Règlement dette'}"`,
      r.montant,
      `"${r.mode_paiement}"`,
      `"${r.vendeur_nom || ''}"`,
      r.dette_apres ?? '',
      `"${(r.note || '').replace(/"/g, '""')}"`,
    ].join(','));
    const csvContent = [header, ...rows].join('\n');
    const blob = new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), csvContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `journal_reglements_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredClients = clients.filter(
    (c) =>
      c.nom.toLowerCase().includes(search.toLowerCase()) ||
      c.telephone.includes(search)
  );

  const filteredReglements = reglements.filter(
    (r) =>
      r.client_nom.toLowerCase().includes(reglementSearch.toLowerCase()) ||
      (r.vendeur_nom && r.vendeur_nom.toLowerCase().includes(reglementSearch.toLowerCase())) ||
      (r.note && r.note.toLowerCase().includes(reglementSearch.toLowerCase()))
  );

  const historySales = historyClient?.id
    ? ventes.filter((vente) => vente.client_id === historyClient.id)
    : [];

  const historyReglements = historyClient?.id
    ? reglements.filter((reg) => reg.client_id === historyClient.id)
    : [];

  if (loading) {
    return <div className="p-8 text-center text-sm text-slate-400">Chargement…</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Clients & Règlements
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Suivi des dossiers clients, gestion des créances et traçabilité complète des règlements .
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activeMainTab === 'clients' ? (
            <>
              <Button
                variant="glass"
                icon={<Download className="w-4 h-4" />}
                onClick={exportClientsCSV}
              >
                CSV
              </Button>
              <Button
                variant="primary"
                icon={<UserPlus className="w-4 h-4" />}
                onClick={handleOpenAddModal}
              >
                Nouveau Client
              </Button>
            </>
          ) : (
            <Button
              variant="glass"
              icon={<Download className="w-4 h-4" />}
              onClick={exportReglementsCSV}
            >
              Exporter Journal CSV
            </Button>
          )}
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200/60 dark:border-white/10 gap-2">
        <button
          onClick={() => setActiveMainTab('clients')}
          className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${activeMainTab === 'clients'
            ? 'border-blue-600 text-blue-600 dark:text-blue-400'
            : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
        >
          <Users className="w-4 h-4" />
          Répertoire Clients ({clients.length})
        </button>
        <button
          onClick={() => setActiveMainTab('reglements')}
          className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${activeMainTab === 'reglements'
            ? 'border-blue-600 text-blue-600 dark:text-blue-400'
            : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
        >
          <History className="w-4 h-4" />
          Journal de tous les Règlements ({reglements.length})
        </button>
      </div>

      {/* TAB 1: CLIENTS REPERTOIRE */}
      {activeMainTab === 'clients' && (
        <>
          {/* Search & Stats bar */}
          <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher un client par nom, téléphone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full glass-input pl-10 pr-4 py-2.5 rounded-2xl text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex items-center gap-3">
              <Badge variant="red" size="md">
                Total Créances :{' '}
                {formatCfa(clients.reduce((s, c) => s + (c.total_dette || 0), 0))}
              </Badge>
            </div>
          </div>

          {/* Clients Directory Table */}
          <GlassCard className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/50 dark:border-white/10 bg-slate-50/50 dark:bg-slate-900/40 text-xs text-slate-500 uppercase tracking-wider">
                    <th className="p-4 font-semibold">Client</th>
                    <th className="p-4 font-semibold">Téléphone</th>
                    <th className="p-4 font-semibold">Email</th>
                    <th className="p-4 font-semibold">Créances (Dette)</th>
                    <th className="p-4 font-semibold text-right">Actions / Règlement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/40 dark:divide-white/5 text-sm">
                  {filteredClients.map((client) => {
                    const hasDebt = client.total_dette > 0;

                    return (
                      <tr
                        key={client.id}
                        className="hover:bg-slate-100/40 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="p-4 font-bold text-slate-900 dark:text-white">
                          <button
                            onClick={() => {
                              setHistoryClient(client);
                              setHistoryTab('ventes');
                            }}
                            className="text-left hover:text-blue-600 transition-colors flex items-center gap-2 group"
                          >
                            <span>{client.nom}</span>
                            <History className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500 transition-colors" />
                          </button>
                        </td>
                        <td className="p-4 text-xs text-slate-600 dark:text-slate-300">
                          <span className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                            {client.telephone}
                          </span>
                        </td>
                        <td className="p-4 text-xs text-slate-500">
                          {client.email ? (
                            <span className="flex items-center gap-1.5">
                              <Mail className="w-3.5 h-3.5 text-slate-400" />
                              {client.email}
                            </span>
                          ) : (
                            <span className="italic opacity-50">-</span>
                          )}
                        </td>
                        <td className="p-4">
                          {hasDebt ? (
                            <Badge variant="red" dot size="sm">
                              {formatCfa(client.total_dette)}
                            </Badge>
                          ) : (
                            <Badge variant="green" size="sm">
                              À jour (0 F)
                            </Badge>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {hasDebt && (
                              <Button
                                variant="success"
                                size="sm"
                                icon={<DollarSign className="w-3.5 h-3.5" />}
                                onClick={() => handleOpenPaymentModal(client)}
                              >
                                Encaisser Règlement
                              </Button>
                            )}
                            <button
                              onClick={() => {
                                setHistoryClient(client);
                                setHistoryTab('reglements');
                              }}
                              title="Historique des règlements"
                              className="p-2 rounded-xl glass-card hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                            >
                              <History className="w-4 h-4 text-blue-500" />
                            </button>
                            <button
                              onClick={() => handleOpenEditModal(client)}
                              title="Modifier la fiche"
                              className="p-2 rounded-xl glass-card hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => client.id && handleDeleteClient(client.id)}
                              title="Supprimer le client"
                              className="p-2 rounded-xl glass-card hover:bg-rose-500/20 text-rose-500"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredClients.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-400">
                        Aucun client trouvé pour « {search} ».
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </>
      )}

      {/* TAB 2: JOURNAL DE TOUS LES RÈGLEMENTS */}
      {activeMainTab === 'reglements' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Filtrer par nom client, vendeur, note..."
                value={reglementSearch}
                onChange={(e) => setReglementSearch(e.target.value)}
                className="w-full glass-input pl-10 pr-4 py-2.5 rounded-2xl text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="green" size="md">
                Total Règlements Encaissés :{' '}
                {formatCfa(
                  reglements
                    .filter((r) => r.type === 'paiement_dette' || r.type === 'acompte')
                    .reduce((sum, r) => sum + r.montant, 0)
                )}
              </Badge>
            </div>
          </div>

          <GlassCard className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/50 dark:border-white/10 bg-slate-50/50 dark:bg-slate-900/40 text-xs text-slate-500 uppercase tracking-wider">
                    <th className="p-4 font-semibold">Date & Heure (Quand)</th>
                    <th className="p-4 font-semibold">Client</th>
                    <th className="p-4 font-semibold">Type</th>
                    <th className="p-4 font-semibold">Montant (Combien)</th>
                    <th className="p-4 font-semibold">Chez qui (Vendeur)</th>
                    <th className="p-4 font-semibold">Mode</th>
                    <th className="p-4 font-semibold">Solde restant</th>
                    <th className="p-4 font-semibold text-right">Reçu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/40 dark:divide-white/5 text-sm">
                  {filteredReglements.map((reg) => {
                    const isRetour = reg.type === 'remboursement_retour';
                    return (
                      <tr
                        key={reg.id}
                        className="hover:bg-slate-100/40 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="p-4 font-mono text-xs text-slate-600 dark:text-slate-300">
                          <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                            <Calendar className="w-3.5 h-3.5 text-blue-500" />
                            {new Date(reg.date).toLocaleDateString('fr-FR')}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {new Date(reg.date).toLocaleTimeString('fr-FR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </td>
                        <td className="p-4 font-bold text-slate-900 dark:text-white">
                          {reg.client_nom}
                        </td>
                        <td className="p-4">
                          {isRetour ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400">
                              <ArrowDownLeft className="w-3 h-3" />
                              Remboursement
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                              <ArrowUpRight className="w-3 h-3" />
                              Paiement dette
                            </span>
                          )}
                        </td>
                        <td className="p-4">
                          <div
                            className={`text-base font-black ${isRetour
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                              }`}
                          >
                            {isRetour ? '-' : '+'}
                            {formatCfa(reg.montant)}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 font-medium">
                            <UserCheck className="w-3.5 h-3.5 text-blue-500" />
                            {reg.vendeur_nom || 'Caissier non précisé'}
                          </div>
                          {reg.vendeur_identifiant && (
                            <div className="text-[10px] text-slate-400 font-mono">
                              ID: {reg.vendeur_identifiant}
                            </div>
                          )}
                        </td>
                        <td className="p-4 text-xs font-semibold text-slate-600 dark:text-slate-300">
                          {reg.mode_paiement === 'mobile_money'
                            ? 'Mobile money'
                            : reg.mode_paiement === 'virement'
                              ? 'Virement'
                              : 'Espèces'}
                        </td>
                        <td className="p-4 text-xs">
                          {reg.dette_apres !== undefined ? (
                            <span className={reg.dette_apres > 0 ? 'text-rose-500 font-bold' : 'text-emerald-500 font-semibold'}>
                              {formatCfa(reg.dette_apres)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <Button
                            variant="glass"
                            size="sm"
                            icon={<FileText className="w-3.5 h-3.5 text-blue-500" />}
                            onClick={() => setSelectedReceiptReglement(reg)}
                          >
                            Reçu
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredReglements.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400">
                        Aucun règlement enregistré pour le moment.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>
      )}

      {/* ADD / EDIT CLIENT MODAL */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingClient ? 'Modifier la Fiche Client' : 'Nouveau Client'}
      >
        <form onSubmit={handleSaveClient} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
              Nom complet du Client *
            </label>
            <input
              type="text"
              required
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="ex: Jean Dupont"
              className="w-full glass-input px-4 py-2.5 rounded-2xl text-sm text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
              Numéro Téléphone (WhatsApp) *
            </label>
            <input
              type="tel"
              required
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              placeholder="ex: +229 97000000"
              className="w-full glass-input px-4 py-2.5 rounded-2xl text-sm text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
              Adresse Email (Optionnel)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ex: client@gmail.com"
              className="w-full glass-input px-4 py-2.5 rounded-2xl text-sm text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
              Annuler
            </Button>
            <Button variant="primary" type="submit">
              Enregistrer
            </Button>
          </div>
        </form>
      </Modal>

      {/* RECORD PAYMENT MODAL */}
      {payingClient && (
        <Modal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          title={`Encaisser un Règlement — ${payingClient.nom}`}
        >
          <form onSubmit={handleConfirmPayment} className="space-y-4">
            {/* Header dette */}
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-center">
              <span className="text-xs uppercase font-bold text-slate-500 dark:text-slate-400">
                Créance Actuelle Due
              </span>
              <div className="text-3xl font-black text-rose-600 dark:text-rose-400 mt-1">
                {formatCfa(payingClient.total_dette)}
              </div>
            </div>

            {/* Montant avec raccourcis */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Montant Réglé aujourd'hui (Combien) *
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setReglementAmount(payingClient.total_dette.toString())}
                    className="text-[11px] font-bold text-blue-600 hover:underline"
                  >
                    Tout solder
                  </button>
                  <span className="text-slate-300">·</span>
                  <button
                    type="button"
                    onClick={() => setReglementAmount(Math.round(payingClient.total_dette / 2).toString())}
                    className="text-[11px] font-bold text-blue-600 hover:underline"
                  >
                    50%
                  </button>
                </div>
              </div>
              <input
                type="text"
                inputMode="decimal"
                required
                value={reglementAmount}
                onChange={(e) => setReglementAmount(e.target.value)}
                className="w-full glass-input px-4 py-3 rounded-2xl text-xl font-black text-emerald-600 dark:text-emerald-400"
              />
            </div>

            {/* Mode de paiement */}
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 block">
                Mode de Règlement
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'especes', label: 'Espèces' },
                  { id: 'mobile_money', label: 'Mobile money' },
                  { id: 'virement', label: 'Virement' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMode(m.id as any)}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition-all ${paymentMode === m.id
                      ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                      : 'glass-input text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10'
                      }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Note / Référence */}
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
                Note / Référence (Optionnel)
              </label>
              <input
                type="text"
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder="ex: Acompte facture #REC123, virement bancaire..."
                className="w-full glass-input px-4 py-2 rounded-xl text-xs text-slate-900 dark:text-white"
              />
            </div>

            {/* Info Caissier & Date */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-white/10 text-xs text-slate-600 dark:text-slate-400 space-y-1">
              <div className="flex justify-between">
                <span>Chez qui (Caissier connecté) :</span>
                <strong className="text-slate-900 dark:text-white">
                  {vendeur?.nom || 'Caissier Principal'}
                </strong>
              </div>
              <div className="flex justify-between">
                <span>Solde restant après règlement :</span>
                <strong className="text-slate-900 dark:text-white">
                  {formatCfa(Math.max(0, payingClient.total_dette - parseAmount(reglementAmount)))}
                </strong>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3">
              <Button variant="ghost" onClick={() => setIsPaymentModalOpen(false)}>
                Annuler
              </Button>
              <Button variant="success" type="submit" icon={<CheckCircle2 className="w-4 h-4" />}>
                Valider et emettre reçu
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* CLIENT DOSSIER & HISTORY MODAL */}
      {historyClient && (
        <Modal
          isOpen={!!historyClient}
          onClose={() => setHistoryClient(null)}
          title={`Dossier Client — ${historyClient.nom}`}
          maxWidth="2xl"
        >
          <div className="space-y-4">
            {/* Top Client Summary Cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20">
                <div className="text-xs text-slate-500">Achats totaux</div>
                <div className="text-xl font-black text-blue-600">
                  {formatCfa(historySales.reduce((sum, v) => sum + v.total, 0))}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="text-xs text-slate-500">Règlements reçus</div>
                <div className="text-xl font-black text-emerald-600">
                  {formatCfa(
                    historyReglements
                      .filter((r) => r.type === 'paiement_dette' || r.type === 'acompte')
                      .reduce((sum, r) => sum + r.montant, 0)
                  )}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20">
                <div className="text-xs text-slate-500">Dette restante</div>
                <div className="text-xl font-black text-rose-600">
                  {formatCfa(historyClient.total_dette)}
                </div>
              </div>
            </div>

            {/* Sub-Tabs: Achats vs Règlements */}
            <div className="flex border-b border-slate-200/60 dark:border-white/10 gap-2">
              <button
                onClick={() => setHistoryTab('ventes')}
                className={`pb-2.5 px-3 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-colors ${historyTab === 'ventes'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Achats & Factures ({historySales.length})
              </button>
              <button
                onClick={() => setHistoryTab('reglements')}
                className={`pb-2.5 px-3 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-colors ${historyTab === 'reglements'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
              >
                <History className="w-3.5 h-3.5" />
                Règlements et Remboursements ({historyReglements.length})
              </button>
            </div>

            {/* ACHATS LIST */}
            {historyTab === 'ventes' && (
              <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                {historySales.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">
                    Aucun achat enregistré pour ce client.
                  </p>
                ) : (
                  historySales.map((vente) => (
                    <div
                      key={vente.id}
                      className="p-4 rounded-2xl border border-slate-200/60 dark:border-white/10 bg-slate-50/50 dark:bg-slate-900/30"
                    >
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white">
                            {new Date(vente.date).toLocaleString('fr-FR')}
                          </div>
                          <div className="text-xs text-slate-400">
                            {vente.methode_paiement.toUpperCase()} · {vente.statut}
                          </div>
                          <div className="text-xs text-blue-600 dark:text-blue-400">
                            Vendu par : {vente.vendeur_nom || 'Vendeur non renseigné'}
                            {vente.vendeur_identifiant ? ` · ID ${vente.vendeur_identifiant}` : ''}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="font-black text-blue-600">{formatCfa(vente.total)}</div>
                          <Button
                            variant="glass"
                            size="sm"
                            icon={<Printer className="w-3.5 h-3.5" />}
                            onClick={() => {
                              setSelectedReceiptSale(vente);
                            }}
                          >
                            Reçu
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                        {lignesVente
                          .filter((ligne) => ligne.vente_id === vente.id)
                          .map((ligne) => (
                            <div key={ligne.id} className="flex justify-between">
                              <span>
                                {ligne.produit_nom}
                                {ligne.variante ? ` - ${ligne.variante}` : ''} × {ligne.quantite}
                              </span>
                              <span>{formatCfa(ligne.prix_unitaire * ligne.quantite)}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* REGLEMENTS LIST */}
            {historyTab === 'reglements' && (
              <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                {historyReglements.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">
                    Aucun règlement enregistré pour ce client.
                  </p>
                ) : (
                  historyReglements.map((reg) => {
                    const isRetour = reg.type === 'remboursement_retour';
                    return (
                      <div
                        key={reg.id}
                        className="p-4 rounded-2xl border border-slate-200/60 dark:border-white/10 bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-between gap-4"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-white text-sm">
                              {new Date(reg.date).toLocaleString('fr-FR')}
                            </span>
                            <Badge variant={isRetour ? 'red' : 'green'} size="sm">
                              {isRetour ? 'Remboursement' : 'Règlement'}
                            </Badge>
                          </div>
                          <div className="text-xs text-slate-500">
                            Encaissé chez :{' '}
                            <strong className="text-slate-700 dark:text-slate-300">
                              {reg.vendeur_nom || 'Caissier'}
                            </strong>
                            {reg.vendeur_identifiant ? ` (${reg.vendeur_identifiant})` : ''} · Mode : {reg.mode_paiement}
                          </div>
                          {reg.dette_avant !== undefined && reg.dette_apres !== undefined && (
                            <div className="text-[11px] text-slate-400">
                              Créance avant : {formatCfa(reg.dette_avant)} ➔ Solde restant :{' '}
                              <strong className="text-slate-700 dark:text-slate-300">
                                {formatCfa(reg.dette_apres)}
                              </strong>
                            </div>
                          )}
                          {reg.note && (
                            <div className="text-[11px] italic text-slate-500">Note : {reg.note}</div>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          <div
                            className={`text-lg font-black ${isRetour
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                              }`}
                          >
                            {isRetour ? '-' : '+'}
                            {formatCfa(reg.montant)}
                          </div>
                          <Button
                            variant="glass"
                            size="sm"
                            icon={<FileText className="w-3.5 h-3.5 text-blue-500" />}
                            onClick={() => setSelectedReceiptReglement(reg)}
                          >
                            Reçu
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* REGLEMENT RECEIPT MODAL (OFFICIAL A4 & WHATSAPP) */}
      {selectedReceiptReglement && (
        <Modal
          isOpen={!!selectedReceiptReglement}
          onClose={() => setSelectedReceiptReglement(null)}
          title="Reçu officiel de Règlement"
        >
          <div className="space-y-4 text-sm">
            {/* Header Badge */}
            <div className="text-center p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                {selectedReceiptReglement.type === 'remboursement_retour'
                  ? 'Reçu de Remboursement'
                  : 'Reçu de Règlement de Créance'}
              </h3>
              <p className="text-xs text-slate-500 mt-1 font-mono">
                Réf : #{selectedReceiptReglement.id ? `REG-${selectedReceiptReglement.id.toString().padStart(5, '0')}` : 'REG-0000'}
              </p>
              <p className="text-xs text-slate-500">
                Date : {new Date(selectedReceiptReglement.date).toLocaleString('fr-FR')}
              </p>
            </div>

            {/* Details Box */}
            <div className="space-y-2 border border-dashed border-slate-300 dark:border-slate-700 p-4 rounded-2xl text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Client :</span>
                <strong className="text-slate-900 dark:text-white">
                  {selectedReceiptReglement.client_nom}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Encaissé par (Chez qui) :</span>
                <strong className="text-slate-900 dark:text-white">
                  {selectedReceiptReglement.vendeur_nom || 'Caissier'}
                  {selectedReceiptReglement.vendeur_identifiant
                    ? ` (ID: ${selectedReceiptReglement.vendeur_identifiant})`
                    : ''}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Mode de versement :</span>
                <strong className="text-slate-900 dark:text-white uppercase">
                  {selectedReceiptReglement.mode_paiement}
                </strong>
              </div>
              {selectedReceiptReglement.note && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Note :</span>
                  <span className="italic text-slate-700 dark:text-slate-300">
                    {selectedReceiptReglement.note}
                  </span>
                </div>
              )}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between text-sm font-black">
                <span>Montant perçu :</span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  {formatCfa(selectedReceiptReglement.montant)}
                </span>
              </div>
              {selectedReceiptReglement.dette_apres !== undefined && (
                <div className="flex justify-between text-xs font-bold text-rose-500">
                  <span>Nouveau solde dû :</span>
                  <span>{formatCfa(selectedReceiptReglement.dette_apres)}</span>
                </div>
              )}
            </div>

            {/* WhatsApp + PDF Actions */}
            {(() => {
              const clientObj = clients.find((c) => c.id === selectedReceiptReglement.client_id);
              const phone = clientObj?.telephone || historyClient?.telephone;

              return (
                <div className="space-y-2">
                  {phone ? (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between gap-3">
                      <div className="text-xs">
                        <div className="font-bold text-emerald-800 dark:text-emerald-300">
                          Envoyer le reçu sur WhatsApp
                        </div>
                        <div className="text-slate-500 font-mono text-[11px]">
                          {phone} • Reçu officiel PDF A4 inclus
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        icon={<MessageSquare className="w-3.5 h-3.5" />}
                        onClick={() => {
                          openWhatsAppDebtReceipt({
                            reglement: selectedReceiptReglement,
                            clientTelephone: phone,
                            settings,
                            downloadPdf: true,
                          });
                        }}
                      >
                        WhatsApp & PDF
                      </Button>
                    </div>
                  ) : null}

                  {/* Bouton Téléchargement Direct PDF A4 */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-white/10 text-xs">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">
                      Reçu officiel imprimable A4 (PDF)
                    </span>
                    <Button
                      type="button"
                      variant="glass"
                      size="sm"
                      icon={<Download className="w-3.5 h-3.5 text-blue-500" />}
                      onClick={() => {
                        generateDebtReceiptA4Pdf({
                          reglement: selectedReceiptReglement,
                          clientTelephone: phone,
                          settings,
                          autoDownload: true,
                        });
                      }}
                    >
                      Télécharger PDF
                    </Button>
                  </div>
                </div>
              );
            })()}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setSelectedReceiptReglement(null)}>
                Fermer
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* SALE RECEIPT MODAL */}
      {selectedReceiptSale && (
        <Modal
          isOpen={!!selectedReceiptSale}
          onClose={() => setSelectedReceiptSale(null)}
          title="Reçu régénéré"
        >
          <ReceiptPrint
            format={receiptFormat}
            settings={settings}
            data={{
              ref: selectedReceiptSale.id,
              date: selectedReceiptSale.date,
              client_nom: selectedReceiptSale.client_nom || historyClient?.nom,
              vendeur_nom: selectedReceiptSale.vendeur_nom,
              vendeur_identifiant: selectedReceiptSale.vendeur_identifiant,
              methode_paiement: selectedReceiptSale.methode_paiement,
              remise: selectedReceiptSale.remise,
              total: selectedReceiptSale.total,
              montant_paye: selectedReceiptSale.montant_paye,
              reste_a_payer: selectedReceiptSale.reste_a_payer,
              regenere: true,
              lignes: lignesVente
                .filter((ligne) => ligne.vente_id === selectedReceiptSale.id)
                .map((ligne) => ({
                  nom: ligne.produit_nom,
                  variante: ligne.variante,
                  quantite: ligne.quantite,
                  prix_unitaire: ligne.prix_unitaire,
                })),
            } satisfies ReceiptData}
          />
          <div className="space-y-4 text-sm">
            <div className="text-center p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20">
              <h3 className="text-lg font-black text-slate-900 dark:text-white">Reçu de paiement</h3>
              <p className="text-xs text-slate-500 mt-1">
                Référence : {selectedReceiptSale.id.substring(0, 8)}
              </p>
              <p className="text-xs text-slate-500">
                Vente du : {new Date(selectedReceiptSale.date).toLocaleString('fr-FR')}
              </p>
              <p className="text-xs text-blue-600 font-semibold">
                Reçu régénéré le : {new Date().toLocaleString('fr-FR')}
              </p>
            </div>
            <div className="space-y-2 border border-dashed border-slate-300 dark:border-slate-700 p-4 rounded-2xl">
              <div className="flex justify-between">
                <span>Client</span>
                <strong>{selectedReceiptSale.client_nom || historyClient?.nom}</strong>
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1">
                {lignesVente
                  .filter((ligne) => ligne.vente_id === selectedReceiptSale.id)
                  .map((ligne) => (
                    <div key={ligne.id} className="flex justify-between text-xs">
                      <span>
                        {ligne.produit_nom}
                        {ligne.variante ? ` - ${ligne.variante}` : ''} × {ligne.quantite}
                      </span>
                      <span>{formatCfa(ligne.prix_unitaire * ligne.quantite)}</span>
                    </div>
                  ))}
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between font-black">
                <span>Total payé</span>
                <span>{formatCfa(selectedReceiptSale.montant_paye)}</span>
              </div>
              {selectedReceiptSale.reste_a_payer > 0 && (
                <div className="flex justify-between text-rose-500 font-bold">
                  <span>Reste à payer</span>
                  <span>{formatCfa(selectedReceiptSale.reste_a_payer)}</span>
                </div>
              )}
            </div>

            {/* WhatsApp send button if client phone is available */}
            {(() => {
              const phone =
                historyClient?.telephone ||
                clients.find((c) => c.id === selectedReceiptSale.client_id)?.telephone;
              return (
                <div className="space-y-2">
                  {phone ? (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between gap-3">
                      <div className="text-xs">
                        <div className="font-bold text-emerald-800 dark:text-emerald-300">
                          Envoyer le reçu sur WhatsApp
                        </div>
                        <div className="text-slate-500 font-mono text-[11px]">
                          {phone} • PDF A4 inclus
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        icon={<MessageSquare className="w-3.5 h-3.5" />}
                        onClick={() => {
                          openWhatsAppReceipt({
                            vente: selectedReceiptSale,
                            lignes: lignesVente
                              .filter((ligne) => ligne.vente_id === selectedReceiptSale.id)
                              .map((l) => ({
                                nom: l.produit_nom,
                                variante: l.variante,
                                quantite: l.quantite,
                                prix_unitaire: l.prix_unitaire,
                              })),
                            clientTelephone: phone,
                            clientNom: selectedReceiptSale.client_nom || historyClient?.nom,
                            settings,
                            downloadPdf: true,
                          });
                        }}
                      >
                        WhatsApp & PDF
                      </Button>
                    </div>
                  ) : null}

                  {/* Téléchargement direct Facture A4 PDF */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-white/10 text-xs">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">
                      Facture officielle A4 (PDF)
                    </span>
                    <Button
                      type="button"
                      variant="glass"
                      size="sm"
                      icon={<Download className="w-3.5 h-3.5 text-blue-500" />}
                      onClick={() => {
                        generateReceiptPdf({
                          vente: selectedReceiptSale,
                          lignes: lignesVente
                            .filter((ligne) => ligne.vente_id === selectedReceiptSale.id)
                            .map((l) => ({
                              nom: l.produit_nom,
                              variante: l.variante,
                              quantite: l.quantite,
                              prix_unitaire: l.prix_unitaire,
                            })),
                          clientNom: selectedReceiptSale.client_nom || historyClient?.nom,
                          clientTelephone: phone,
                          settings,
                          autoDownload: true,
                        }).catch((e) =>
                          alert({ title: 'Téléchargement impossible', message: (e as Error).message })
                        );
                      }}
                    >
                      Télécharger PDF
                    </Button>
                  </div>
                </div>
              );
            })()}

            <div className="flex flex-col sm:flex-row justify-end gap-3">
              <select
                value={receiptFormat}
                onChange={(e) => setReceiptFormat(e.target.value as ReceiptFormat)}
                className="glass-input px-3 py-2 rounded-xl text-xs text-slate-900 dark:text-white"
              >
                <option value="thermique">Thermique (80mm)</option>
                <option value="a4">Facture A4</option>
              </select>
              <Button variant="ghost" onClick={() => setSelectedReceiptSale(null)}>
                Fermer
              </Button>
              <Button
                variant="primary"
                icon={<Printer className="w-4 h-4" />}
                onClick={handlePrintReceipt}
              >
                Imprimer le reçu
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
