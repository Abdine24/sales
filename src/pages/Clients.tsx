import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Users,
  UserPlus,
  Search,
  DollarSign,
  CreditCard,
  Phone,
  Mail,
  Edit2,
  Trash2,
  CheckCircle2,
  Printer,
} from 'lucide-react';
import { db, Client, Vente } from '../db/db';
import { pushToSyncQueue } from '../hooks/useSync';
import { GlassCard } from '../components/ui/GlassCard';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { formatCfa } from '../utils/currency';

export const Clients: React.FC = () => {
  const clients = useLiveQuery(() => db.clients.toArray(), []) || [];
  const ventes = useLiveQuery(() => db.ventes.orderBy('date').reverse().toArray(), []) || [];
  const lignesVente = useLiveQuery(() => db.lignes_vente.toArray(), []) || [];
  const [search, setSearch] = useState('');
  const [historyClient, setHistoryClient] = useState<Client | null>(null);
  const [selectedReceiptSale, setSelectedReceiptSale] = useState<Vente | null>(null);

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

    if (editingClient && editingClient.id) {
      const updated: Client = {
        ...editingClient,
        nom,
        telephone,
        email,
      };
      await db.clients.update(editingClient.id, updated);
      await pushToSyncQueue('UPDATE', 'clients', updated);
    } else {
      const newClient: Client = {
        nom,
        telephone,
        email,
        total_dette: 0,
      };
      const newId = await db.clients.add(newClient);
      await pushToSyncQueue('INSERT', 'clients', { id: newId, ...newClient });
    }

    setIsModalOpen(false);
  };

  const handleDeleteClient = async (id: number) => {
    if (confirm('Voulez-vous vraiment supprimer ce client ?')) {
      await db.clients.delete(id);
      await pushToSyncQueue('DELETE', 'clients', { id });
    }
  };

  // Open Payment modal
  const handleOpenPaymentModal = (c: Client) => {
    setPayingClient(c);
    setReglementAmount(c.total_dette.toString());
    setIsPaymentModalOpen(true);
  };

  // Confirm payment settlement
  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingClient || !payingClient.id || !reglementAmount) return;

    const amountPaid = parseFloat(reglementAmount) || 0;
    const newDebt = Math.max(0, payingClient.total_dette - amountPaid);

    await db.clients.update(payingClient.id, { total_dette: newDebt });
    await pushToSyncQueue('UPDATE', 'clients', {
      id: payingClient.id,
      total_dette: newDebt,
    });

    setIsPaymentModalOpen(false);
    setPayingClient(null);
  };

  const filteredClients = clients.filter(
    (c) =>
      c.nom.toLowerCase().includes(search.toLowerCase()) ||
      c.telephone.includes(search)
  );

  const historySales = historyClient?.id
    ? ventes.filter((vente) => vente.client_id === historyClient.id)
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Répertoire Clients & Créances
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Suivi des dossiers clients, gestion des dettes et remboursement des acomptes.
          </p>
        </div>
        <Button
          variant="primary"
          icon={<UserPlus className="w-4 h-4" />}
          onClick={handleOpenAddModal}
        >
          Nouveau Client
        </Button>
      </div>

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
                      <button onClick={() => setHistoryClient(client)} className="text-left hover:text-blue-600 transition-colors">
                        {client.nom}
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
                          À jour (0 CFA)
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
                            Enregistrer Règlement
                          </Button>
                        )}
                        <button
                          onClick={() => handleOpenEditModal(client)}
                          className="p-2 rounded-xl glass-card hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => client.id && handleDeleteClient(client.id)}
                          className="p-2 rounded-xl glass-card hover:bg-rose-500/20 text-rose-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* ADD / EDIT CLIENT MODAL */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingClient ? 'Modifier la Fiche Client' : 'Nouveau Client'}
      >
        <form onSubmit={handleSaveClient} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
              Nom complet
            </label>
            <input
              type="text"
              required
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="ex: Jean-Marc Dupont"
              className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
              Numéro de téléphone
            </label>
            <input
              type="tel"
              required
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              placeholder="06 12 34 56 78"
              className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
              Adresse e-mail (Optionnel)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@email.fr"
              className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm text-slate-900 dark:text-white"
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
          title={`Enregistrer un Règlement - ${payingClient.nom}`}
        >
          <form onSubmit={handleConfirmPayment} className="space-y-4">
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-center">
              <span className="text-xs uppercase font-bold text-slate-500 dark:text-slate-400">
                Créance Actuelle Due
              </span>
              <div className="text-3xl font-black text-rose-600 dark:text-rose-400 mt-1">
                {formatCfa(payingClient.total_dette)}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
                Montant Réglé aujourd'hui (CFA)
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={reglementAmount}
                onChange={(e) => setReglementAmount(e.target.value)}
                className="w-full glass-input px-4 py-3 rounded-2xl text-lg font-bold text-slate-900 dark:text-white"
              />
            </div>

            <p className="text-xs text-slate-400">
              Nouveau solde restant après paiement :{' '}
              <strong className="text-slate-900 dark:text-white">
                {formatCfa(
                  Math.max(
                    0,
                    payingClient.total_dette - (parseFloat(reglementAmount) || 0)
                  )
                )}
              </strong>
            </p>

            <div className="flex justify-end gap-3 pt-3">
              <Button variant="ghost" onClick={() => setIsPaymentModalOpen(false)}>
                Annuler
              </Button>
              <Button variant="success" type="submit" icon={<CheckCircle2 className="w-4 h-4" />}>
                Valider le Règlement
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {historyClient && (
        <Modal
          isOpen={!!historyClient}
          onClose={() => setHistoryClient(null)}
          title={`Achats de ${historyClient.nom}`}
          maxWidth="xl"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20">
                <div className="text-xs text-slate-500">Nombre de ventes</div>
                <div className="text-2xl font-black text-blue-600">{historySales.length}</div>
              </div>
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="text-xs text-slate-500">Total acheté</div>
                <div className="text-2xl font-black text-emerald-600">{formatCfa(historySales.reduce((sum, vente) => sum + vente.total, 0))}</div>
              </div>
            </div>
            {historySales.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">Aucun achat enregistré pour ce client.</p>
            ) : (
              <div className="space-y-3 max-h-[55vh] overflow-y-auto">
                {historySales.map((vente) => (
                  <div key={vente.id} className="p-4 rounded-2xl border border-slate-200/60 dark:border-white/10 bg-slate-50/50 dark:bg-slate-900/30">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white">{new Date(vente.date).toLocaleString('fr-FR')}</div>
                        <div className="text-xs text-slate-400">{vente.methode_paiement.toUpperCase()} · {vente.statut}</div>
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
                                setHistoryClient(null);
                                setSelectedReceiptSale(vente);
                              }}
                            >
                              Reçu
                            </Button>
                          </div>
                    </div>
                    <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                      {lignesVente.filter((ligne) => ligne.vente_id === vente.id).map((ligne) => (
                        <div key={ligne.id} className="flex justify-between">
                          <span>{ligne.produit_nom}{ligne.variante ? ` - ${ligne.variante}` : ''} × {ligne.quantite}</span>
                          <span>{formatCfa(ligne.prix_unitaire * ligne.quantite)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {selectedReceiptSale && (
        <Modal
          isOpen={!!selectedReceiptSale}
          onClose={() => setSelectedReceiptSale(null)}
          title="Reçu régénéré"
        >
          <div className="space-y-4 text-sm">
            <div className="text-center p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20">
              <h3 className="text-lg font-black text-slate-900 dark:text-white">Reçu de paiement</h3>
              <p className="text-xs text-slate-500 mt-1">Référence : {selectedReceiptSale.id.substring(0, 8)}</p>
              <p className="text-xs text-slate-500">Vente du : {new Date(selectedReceiptSale.date).toLocaleString('fr-FR')}</p>
              <p className="text-xs text-blue-600 font-semibold">Reçu régénéré le : {new Date().toLocaleString('fr-FR')}</p>
            </div>
            <div className="space-y-2 border border-dashed border-slate-300 dark:border-slate-700 p-4 rounded-2xl">
              <div className="flex justify-between"><span>Client</span><strong>{selectedReceiptSale.client_nom || historyClient?.nom}</strong></div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1">
                {lignesVente.filter((ligne) => ligne.vente_id === selectedReceiptSale.id).map((ligne) => (
                  <div key={ligne.id} className="flex justify-between text-xs">
                    <span>{ligne.produit_nom}{ligne.variante ? ` - ${ligne.variante}` : ''} × {ligne.quantite}</span>
                    <span>{formatCfa(ligne.prix_unitaire * ligne.quantite)}</span>
                  </div>
                ))}
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between font-black">
                <span>Total payé</span><span>{formatCfa(selectedReceiptSale.montant_paye)}</span>
              </div>
              {selectedReceiptSale.reste_a_payer > 0 && (
                <div className="flex justify-between text-rose-500 font-bold"><span>Reste à payer</span><span>{formatCfa(selectedReceiptSale.reste_a_payer)}</span></div>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setSelectedReceiptSale(null)}>Fermer</Button>
              <Button variant="primary" icon={<Printer className="w-4 h-4" />} onClick={() => window.print()}>Imprimer le reçu</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
