import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Receipt,
  Search,
  Undo2,
  X,
  AlertCircle,
  CheckCircle2,
  Banknote,
  Smartphone,
  Wallet,
  Ban,
  Minus,
  Plus,
  Printer,
  Download,
} from 'lucide-react';
import type { Vente, LigneVente, Retour, RetourLigne, MotifRetour, ModeRemboursement, AppSettings, Client } from '../db/db';
import { apiGet, apiPost, ApiError } from '../services/api';
import { GlassCard } from '../components/ui/GlassCard';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { DateRangePicker } from '../components/ui/DateRangePicker';
import { useDialog } from '../components/ui/DialogProvider';
import { formatCfa } from '../utils/currency';
import { ReceiptPrint, ReceiptData, ReceiptFormat } from '../components/ReceiptPrint';
import { openWhatsAppReceipt } from '../utils/whatsapp';
import { generateInvoiceA4Pdf } from '../utils/pdfInvoice';

interface VentesProps {
  activeZoneId: number | null;
  vendeur: { id?: number; nom: string; identifiant: string };
}

const MOTIF_LABELS: Record<MotifRetour, string> = {
  client_insatisfait: 'Client insatisfait',
  defectueux: 'Article défectueux',
  erreur_caisse: 'Erreur de caisse',
  autre: 'Autre motif',
};

export const Ventes: React.FC<VentesProps> = ({ activeZoneId, vendeur }) => {
  const { alert, toast } = useDialog();
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [lignesVente, setLignesVente] = useState<LigneVente[]>([]);
  const [retours, setRetours] = useState<Retour[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [v, l, r, c, s] = await Promise.all([
        apiGet<Vente[]>('/ventes'),
        apiGet<LigneVente[]>('/ventes/lignes/all'),
        apiGet<Retour[]>('/retours'),
        apiGet<Client[]>('/clients'),
        apiGet<AppSettings>('/settings'),
      ]);
      setVentes([...v].sort((a, b) => b.date.localeCompare(a.date)));
      setLignesVente(l);
      setRetours([...r].sort((a, b) => b.date.localeCompare(a.date)));
      setClients(c);
      setSettings(s);
    } catch (err) {
      await alert(err instanceof ApiError ? err.message : "Impossible de charger l'historique des ventes.");
    } finally {
      setLoading(false);
    }
  }, [alert]);

  useEffect(() => {
    reload();
  }, [reload]);

  const today = new Date().toISOString().split('T')[0];
  const defaultStart = new Date(Date.now() - 29 * 86400000).toISOString().split('T')[0];
  const [dateDebut, setDateDebut] = useState(defaultStart);
  const [dateFin, setDateFin] = useState(today);
  const [search, setSearch] = useState('');
  const [statutFilter, setStatutFilter] = useState<'all' | 'paye' | 'partiel' | 'credit'>('all');
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const [retourVente, setRetourVente] = useState<Vente | null>(null);
  const [selectedReceiptSale, setSelectedReceiptSale] = useState<Vente | null>(null);
  const [receiptFormat, setReceiptFormat] = useState<ReceiptFormat>('thermique');

  React.useEffect(() => {
    if (settings?.print_format_default) {
      setReceiptFormat(settings.print_format_default);
    }
  }, [settings?.print_format_default]);

  const lignesParVente = (venteId: string) => lignesVente.filter((l) => l.vente_id === venteId);
  const retoursParVente = (venteId: string) => retours.filter((r) => r.vente_id === venteId);

  // Quantité déjà retournée pour une ligne (produit + variante) d'une vente donnée.
  const quantiteDejaRetournee = (venteId: string, produitId: number, variantId?: string) =>
    retoursParVente(venteId)
      .flatMap((r) => r.lignes)
      .filter((l) => l.produit_id === produitId && (l.variant_id || undefined) === (variantId || undefined))
      .reduce((sum, l) => sum + l.quantite, 0);

  const ventesFiltrees = useMemo(() => {
    const q = search.toLowerCase().trim();
    return ventes.filter((v) => {
      const date = v.date.split('T')[0];
      const matchDate = date >= dateDebut && date <= dateFin;
      const matchZone = activeZoneId === null || v.zone_id === activeZoneId;
      const matchStatut = statutFilter === 'all' || v.statut === statutFilter;
      const matchSearch =
        !q ||
        v.id.toLowerCase().includes(q) ||
        (v.client_nom || '').toLowerCase().includes(q) ||
        (v.vendeur_nom || '').toLowerCase().includes(q);
      return matchDate && matchZone && matchStatut && matchSearch;
    });
  }, [ventes, dateDebut, dateFin, activeZoneId, statutFilter, search]);

  const totalPages = Math.max(1, Math.ceil(ventesFiltrees.length / pageSize));
  const paginated = ventesFiltrees.slice((page - 1) * pageSize, page * pageSize);

  const montantRetourne = (venteId: string) =>
    retoursParVente(venteId).reduce((sum, r) => sum + r.montant_total, 0);

  if (loading) {
    return <div className="p-8 text-center text-sm text-slate-400">Chargement…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Ventes & Retours</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Historique complet des ventes. Enregistre un retour quand un client rapporte un article.
          </p>
        </div>
        <DateRangePicker
          startDate={dateDebut}
          endDate={dateFin}
          onChange={(start, end) => {
            setDateDebut(start);
            setDateFin(end);
            setPage(1);
          }}
        />
      </div>

      <GlassCard className="p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-200/50 dark:border-white/10 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Rechercher réf, client ou vendeur..."
              className="w-full glass-input pl-10 pr-4 py-2.5 rounded-2xl text-sm text-slate-900 dark:text-white"
            />
          </div>
          <select
            value={statutFilter}
            onChange={(e) => {
              setStatutFilter(e.target.value as typeof statutFilter);
              setPage(1);
            }}
            className="glass-input px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            <option value="all">Tous les statuts</option>
            <option value="paye">Payé</option>
            <option value="partiel">Partiel</option>
            <option value="credit">À crédit</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/50 dark:border-white/10 bg-slate-50/50 dark:bg-slate-900/40 text-xs text-slate-500 uppercase tracking-wider">
                <th className="p-4 font-semibold">Date</th>
                <th className="p-4 font-semibold">Réf</th>
                <th className="p-4 font-semibold">Client</th>
                <th className="p-4 font-semibold">Vendeur</th>
                <th className="p-4 font-semibold text-right">Total</th>
                <th className="p-4 font-semibold text-right">Statut</th>
                <th className="p-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/40 dark:divide-white/5 text-sm">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-slate-400 italic">
                    Aucune vente sur cette période.
                  </td>
                </tr>
              ) : (
                paginated.map((v) => {
                  const retourne = montantRetourne(v.id);
                  return (
                    <tr key={v.id} className="hover:bg-slate-100/40 dark:hover:bg-slate-800/30">
                      <td className="p-4 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(v.date).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="p-4 font-mono text-xs font-bold text-slate-900 dark:text-white">{v.id.slice(0, 8)}</td>
                      <td className="p-4 text-sm text-slate-700 dark:text-slate-200">{v.client_nom || 'Client Passant'}</td>
                      <td className="p-4 text-xs text-slate-500">{v.vendeur_nom || '—'}</td>
                      <td className="p-4 text-right font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        {formatCfa(v.total)}
                        {retourne > 0 && (
                          <div className="text-[10px] font-semibold text-rose-500 mt-0.5">- {formatCfa(retourne)} retourné</div>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <Badge variant={v.statut === 'paye' ? 'green' : v.statut === 'partiel' ? 'amber' : 'red'} size="sm">
                          {v.statut === 'paye' ? 'Payé' : v.statut === 'partiel' ? 'Partiel' : 'À crédit'}
                        </Badge>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="glass"
                            size="sm"
                            icon={<Printer className="w-3.5 h-3.5 text-blue-500" />}
                            onClick={() => setSelectedReceiptSale(v)}
                            title="Réimprimer le reçu de caisse"
                          >
                            Reçu
                          </Button>
                          <Button
                            variant="glass"
                            size="sm"
                            icon={<Undo2 className="w-3.5 h-3.5 text-rose-500" />}
                            onClick={() => setRetourVente(v)}
                            title="Enregistrer un retour d'article"
                          >
                            Retour
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-200/50 dark:border-white/10 flex items-center justify-between text-xs text-slate-500">
            <span>Page {page} / {totalPages}</span>
            <div className="flex gap-2">
              <Button variant="glass" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Précédent</Button>
              <Button variant="glass" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Suivant</Button>
            </div>
          </div>
        )}
      </GlassCard>

      {/* MODAL: Réimpression de Ticket */}
      {selectedReceiptSale && (
        <Modal
          isOpen={Boolean(selectedReceiptSale)}
          onClose={() => setSelectedReceiptSale(null)}
          title="Réimpression du reçu de caisse"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-white/10">
              <div>
                <div className="text-xs text-slate-400">Référence Vente</div>
                <div className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                  {selectedReceiptSale.id.substring(0, 8).toUpperCase()}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400">Total Vente</div>
                <div className="font-black text-sm text-blue-600 dark:text-blue-400">
                  {formatCfa(selectedReceiptSale.total)}
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">
                Format d'impression
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setReceiptFormat('thermique')}
                  className={`p-3 rounded-xl border text-xs font-bold transition-all ${
                    receiptFormat === 'thermique'
                      ? 'border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-400 shadow-xs'
                      : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Rouleau 80mm / 58mm
                </button>
                <button
                  type="button"
                  onClick={() => setReceiptFormat('a4')}
                  className={`p-3 rounded-xl border text-xs font-bold transition-all ${
                    receiptFormat === 'a4'
                      ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Facture A4
                </button>
              </div>
            </div>

            {/* WhatsApp option if client has phone */}
            {(() => {
              const matchedClient = clients.find(
                (c) =>
                  (selectedReceiptSale.client_id && c.id === selectedReceiptSale.client_id) ||
                  (selectedReceiptSale.client_nom && c.nom.toLowerCase() === selectedReceiptSale.client_nom.toLowerCase())
              );
              const phone = matchedClient?.telephone;

              return (
                <div className="space-y-2">
                  {phone ? (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between gap-3">
                      <div className="text-xs">
                        <div className="font-bold text-emerald-800 dark:text-emerald-300">
                          Envoyer le reçu sur WhatsApp
                        </div>
                        <div className="text-slate-500 font-mono text-[11px]">{phone} • PDF A4 inclus</div>
                      </div>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => {
                          openWhatsAppReceipt({
                            vente: selectedReceiptSale,
                            lignes: lignesParVente(selectedReceiptSale.id).map((l) => ({
                              nom: l.produit_nom,
                              variante: l.variante,
                              quantite: l.quantite,
                              prix_unitaire: l.prix_unitaire,
                            })),
                            clientTelephone: phone,
                            clientNom: selectedReceiptSale.client_nom,
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
                    <span className="text-slate-600 dark:text-slate-400 font-medium">Facture officielle au format A4 (PDF)</span>
                    <Button
                      type="button"
                      variant="glass"
                      size="sm"
                      icon={<Download className="w-3.5 h-3.5 text-blue-500" />}
                      onClick={() => {
                        generateInvoiceA4Pdf({
                          vente: selectedReceiptSale,
                          lignes: lignesParVente(selectedReceiptSale.id).map((l) => ({
                            nom: l.produit_nom,
                            variante: l.variante,
                            quantite: l.quantite,
                            prix_unitaire: l.prix_unitaire,
                          })),
                          clientNom: selectedReceiptSale.client_nom,
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

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200/60 dark:border-white/10">
              <Button variant="ghost" onClick={() => setSelectedReceiptSale(null)}>
                Fermer
              </Button>
              <Button
                variant="primary"
                icon={<Printer className="w-4 h-4" />}
                onClick={() => window.print()}
              >
                Lancer l'impression
              </Button>
            </div>

            {selectedReceiptSale && (
              <ReceiptPrint
                data={{
                  ref: selectedReceiptSale.id,
                  date: selectedReceiptSale.date,
                  client_nom: selectedReceiptSale.client_nom,
                  vendeur_nom: selectedReceiptSale.vendeur_nom,
                  methode_paiement: selectedReceiptSale.methode_paiement,
                  lignes: lignesParVente(selectedReceiptSale.id).map((l) => ({
                    nom: l.produit_nom,
                    variante: l.variante,
                    quantite: l.quantite,
                    prix_unitaire: l.prix_unitaire,
                  })),
                  remise: selectedReceiptSale.remise,
                  total: selectedReceiptSale.total,
                  montant_paye: selectedReceiptSale.montant_paye,
                  reste_a_payer: selectedReceiptSale.reste_a_payer,
                  regenere: true,
                }}
                format={receiptFormat}
                settings={settings}
              />
            )}
          </div>
        </Modal>
      )}

      {retourVente && (
        <RetourModal
          vente={retourVente}
          lignes={lignesParVente(retourVente.id)}
          quantiteDejaRetournee={(produitId, variantId) => quantiteDejaRetournee(retourVente.id, produitId, variantId)}
          vendeur={vendeur}
          activeZoneId={activeZoneId}
          onClose={() => setRetourVente(null)}
          onSuccess={async () => {
            setRetourVente(null);
            await reload();
            toast('Retour enregistré : le stock a été remis à jour.');
          }}
        />
      )}
    </div>
  );
};

interface RetourModalProps {
  vente: Vente;
  lignes: LigneVente[];
  quantiteDejaRetournee: (produitId: number, variantId?: string) => number;
  vendeur: { id?: number; nom: string; identifiant: string };
  activeZoneId: number | null;
  onClose: () => void;
  onSuccess: () => void;
}

const RetourModal: React.FC<RetourModalProps> = ({ vente, lignes, quantiteDejaRetournee, vendeur, activeZoneId, onClose, onSuccess }) => {
  const { confirm, alert } = useDialog();
  const [quantites, setQuantites] = useState<Record<number, number>>({});
  const [motif, setMotif] = useState<MotifRetour>('client_insatisfait');
  const [modeRemboursement, setModeRemboursement] = useState<ModeRemboursement>('especes');
  const [commentaire, setCommentaire] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const lignesRetournables = lignes.map((ligne, index) => {
    const dejaRetourne = quantiteDejaRetournee(ligne.produit_id, ligne.variant_id);
    const restant = Math.max(0, ligne.quantite - dejaRetourne);
    return { ligne, index, restant };
  });

  const getQty = (index: number) => quantites[index] || 0;
  const setQty = (index: number, value: number, max: number) => {
    const clamped = Math.max(0, Math.min(max, Math.round(value) || 0));
    setQuantites((prev) => ({ ...prev, [index]: clamped }));
  };

  const montantTotal = lignesRetournables.reduce((sum, { ligne, index }) => sum + getQty(index) * ligne.prix_unitaire, 0);
  const hasSelection = montantTotal > 0;

  const handleConfirm = async () => {
    if (!hasSelection) return;
    const ok = await confirm({
      title: 'Confirmer le retour',
      message: `Confirmer le retour de ${formatCfa(montantTotal)} ? Le stock sera remis à jour immédiatement.`,
      confirmLabel: 'Confirmer le retour',
    });
    if (!ok) return;

    setSubmitting(true);
    try {
      const retourLignes: RetourLigne[] = lignesRetournables
        .filter(({ index }) => getQty(index) > 0)
        .map(({ ligne, index }) => ({
          produit_id: ligne.produit_id,
          variant_id: ligne.variant_id,
          produit_nom: ligne.produit_nom,
          variante: ligne.variante,
          quantite: getQty(index),
          prix_unitaire: ligne.prix_unitaire,
        }));

      // Le serveur fait tout atomiquement : remise en stock, journal du retour, et si la vente
      // était liée à un client, réduction de sa dette + trace dans les règlements (voir
      // server/src/routes/retours.js).
      await apiPost('/retours', {
        vente_id: vente.id,
        client_id: vente.client_id,
        client_nom: vente.client_nom,
        lignes: retourLignes,
        montant_total: montantTotal,
        mode_remboursement: modeRemboursement,
        motif,
        motif_label: MOTIF_LABELS[motif],
        commentaire: commentaire.trim() || undefined,
        zone_id: activeZoneId,
        vendeur_id: vendeur.id ?? null,
        vendeur_nom: vendeur.nom,
        vendeur_identifiant: vendeur.identifiant,
      });

      onSuccess();
    } catch (err) {
      await alert(err instanceof ApiError ? err.message : "Le retour n'a pas pu être enregistré.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={`Retour — Vente ${vente.id.slice(0, 8)}`} maxWidth="lg">
      <div className="space-y-5">
        <div className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-900/40 border border-slate-200/60 dark:border-white/10 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-blue-500 shrink-0" />
          <span>Indiquez les quantités rapportées par le client. Le stock sera automatiquement réincrémenté.</span>
        </div>

        {lignesRetournables.every(({ restant }) => restant === 0) ? (
          <div className="py-8 text-center text-slate-400">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
            Tous les articles de cette vente ont déjà été retournés.
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[35vh] overflow-y-auto pr-1">
            {lignesRetournables.map(({ ligne, index, restant }) => (
              <div
                key={ligne.id ?? index}
                className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                  restant === 0 ? 'opacity-40 border-slate-200/40 dark:border-white/5' : 'border-slate-200/60 dark:border-white/10'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {ligne.produit_nom}{ligne.variante ? ` (${ligne.variante})` : ''}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Vendu : {ligne.quantite} × {formatCfa(ligne.prix_unitaire)} · Retournable : {restant}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    disabled={restant === 0 || getQty(index) <= 0}
                    onClick={() => setQty(index, getQty(index) - 1, restant)}
                    className="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-30"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={getQty(index)}
                    onChange={(e) => setQty(index, Number(e.target.value.replace(/\D/g, '')), restant)}
                    disabled={restant === 0}
                    className="w-10 text-center text-sm font-bold glass-input rounded-lg py-1"
                  />
                  <button
                    type="button"
                    disabled={restant === 0 || getQty(index) >= restant}
                    onClick={() => setQty(index, getQty(index) + 1, restant)}
                    className="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-30"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Motif du retour</label>
            <select
              value={motif}
              onChange={(e) => setMotif(e.target.value as MotifRetour)}
              className="w-full glass-input px-3 py-2.5 rounded-xl text-sm text-slate-900 dark:text-white"
            >
              {(Object.keys(MOTIF_LABELS) as MotifRetour[]).map((m) => (
                <option key={m} value={m}>{MOTIF_LABELS[m]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Mode de remboursement</label>
            <select
              value={modeRemboursement}
              onChange={(e) => setModeRemboursement(e.target.value as ModeRemboursement)}
              className="w-full glass-input px-3 py-2.5 rounded-xl text-sm text-slate-900 dark:text-white"
            >
              <option value="especes">Espèces</option>
              <option value="mobile_money">Mobile money</option>
              <option value="virement">Virement</option>
                        </select>
            <p className="text-xs text-slate-400 mt-1">Le montant du retour sera déduit de la dette du client (si dette {'>'} 0).</p>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Commentaire (optionnel)</label>
          <input
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            placeholder="Précision utile pour l'équipe..."
            className="w-full glass-input px-3 py-2.5 rounded-xl text-sm text-slate-900 dark:text-white"
          />
        </div>

        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-between">
          <span className="text-xs font-bold uppercase text-rose-600 dark:text-rose-400">Total à rembourser</span>
          <span className="text-xl font-black text-rose-600 dark:text-rose-400">{formatCfa(montantTotal)}</span>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="danger" disabled={!hasSelection || submitting} onClick={handleConfirm} icon={<Undo2 className="w-4 h-4" />}>
            {submitting ? 'Enregistrement...' : 'Confirmer le retour'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
