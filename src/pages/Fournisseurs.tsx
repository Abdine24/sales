import React, { useCallback, useEffect, useState } from 'react';
import {
  Truck,
  Plus,
  Search,
  Phone,
  Mail,
  Edit2,
  Trash2,
  Package,
} from 'lucide-react';
import type { Fournisseur, AchatStock } from '../db/db';
import { apiGet, apiPost, apiPut, apiDelete, ApiError } from '../services/api';
import { GlassCard } from '../components/ui/GlassCard';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { useDialog } from '../components/ui/DialogProvider';
import { formatCfa } from '../utils/currency';

export const Fournisseurs: React.FC = () => {
  const { confirm, alert } = useDialog();
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [achats, setAchats] = useState<AchatStock[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');

  // Add / Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFournisseur, setEditingFournisseur] = useState<Fournisseur | null>(null);
  const [nom, setNom] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');

  const reload = useCallback(async () => {
    try {
      const [f, a] = await Promise.all([
        apiGet<Fournisseur[]>('/fournisseurs'),
        apiGet<AchatStock[]>('/achats-stock'),
      ]);
      setFournisseurs(f);
      setAchats(a);
    } catch (err) {
      await alert(err instanceof ApiError ? err.message : 'Impossible de charger les fournisseurs.');
    } finally {
      setLoading(false);
    }
  }, [alert]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleOpenAddModal = () => {
    setEditingFournisseur(null);
    setNom('');
    setContact('');
    setEmail('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (f: Fournisseur) => {
    setEditingFournisseur(f);
    setNom(f.nom);
    setContact(f.contact);
    setEmail(f.email || '');
    setIsModalOpen(true);
  };

  const handleSaveFournisseur = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nom || !contact) return;

    try {
      if (editingFournisseur?.id) {
        await apiPut(`/fournisseurs/${editingFournisseur.id}`, { nom, contact, email });
      } else {
        await apiPost('/fournisseurs', { nom, contact, email });
      }
      setIsModalOpen(false);
      await reload();
    } catch (err) {
      await alert(err instanceof ApiError ? err.message : "Échec de l'enregistrement du fournisseur.");
    }
  };

  const handleDeleteFournisseur = async (id: number) => {
    const ok = await confirm({
      title: 'Supprimer le fournisseur',
      message: 'Voulez-vous supprimer ce fournisseur ?',
      danger: true,
      confirmLabel: 'Supprimer',
    });
    if (!ok) return;
    try {
      await apiDelete(`/fournisseurs/${id}`);
      await reload();
    } catch (err) {
      await alert(err instanceof ApiError ? err.message : 'Échec de la suppression.');
    }
  };

  const filteredFournisseurs = fournisseurs.filter((f) =>
    f.nom.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <div className="p-8 text-center text-sm text-slate-400">Chargement…</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Fournisseurs & Partenaires
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gestion des contacts approvisionnement et fabricants.
          </p>
        </div>
        <Button
          variant="primary"
          icon={<Plus className="w-4 h-4" />}
          onClick={handleOpenAddModal}
        >
          Nouveau Fournisseur
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Rechercher un fournisseur..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full glass-input pl-10 pr-4 py-2.5 rounded-2xl text-sm text-slate-900 dark:text-white"
        />
      </div>

      {/* Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredFournisseurs.map((fournisseur) => {
          const supplierAchats = achats.filter((a) => a.fournisseur_id === fournisseur.id);
          const totalSpent = supplierAchats.reduce((s, a) => s + (a.cout_total || 0), 0);

          return (
            <GlassCard key={fournisseur.id} hoverEffect className="flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between">
                  <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                    <Truck className="w-6 h-6" />
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleOpenEditModal(fournisseur)}
                      className="p-2 rounded-xl glass-card hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => fournisseur.id && handleDeleteFournisseur(fournisseur.id)}
                      className="p-2 rounded-xl glass-card hover:bg-rose-500/20 text-rose-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-3">
                  {fournisseur.nom}
                </h3>

                <div className="mt-3 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{fournisseur.contact}</span>
                  </div>
                  {fournisseur.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{fournisseur.email}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200/50 dark:border-white/10 flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-1">
                  <Package className="w-3.5 h-3.5" /> {supplierAchats.length} commandes
                </span>
                <Badge variant="purple" size="sm">
                  Total : {formatCfa(totalSpent)}
                </Badge>
              </div>
            </GlassCard>
          );
        })}
      </div>

      {/* ADD / EDIT MODAL */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingFournisseur ? 'Modifier le Fournisseur' : 'Nouveau Fournisseur'}
      >
        <form onSubmit={handleSaveFournisseur} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
              Nom de la société / Fournisseur
            </label>
            <input
              type="text"
              required
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="ex: Apple EMEA Logistics"
              className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
              Contact Téléphone / Commercial
            </label>
            <input
              type="text"
              required
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="+33 1 40 00 00 00"
              className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
              Email (Optionnel)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="logistique@fournisseur.com"
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
    </div>
  );
};
