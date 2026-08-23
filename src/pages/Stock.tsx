import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Package,
  Plus,
  Search,
  Edit2,
  Trash2,
  Barcode,
  Truck,
  AlertTriangle,
} from 'lucide-react';
import { db, Produit } from '../db/db';
import { pushToSyncQueue } from '../hooks/useSync';
import { GlassCard } from '../components/ui/GlassCard';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { formatCfa } from '../utils/currency';

interface StockProps {
  activeZoneId: number | null;
}

export const Stock: React.FC<StockProps> = ({ activeZoneId }) => {
  const produits = useLiveQuery(() => db.produits.toArray(), []) || [];
  const fournisseurs = useLiveQuery(() => db.fournisseurs.toArray(), []) || [];
  const zones = useLiveQuery(() => db.zones.toArray(), []) || [];
  const categoriesDb = useLiveQuery(() => db.categories.orderBy('nom').toArray(), []) || [];
  const achats = useLiveQuery(() => db.achats_stock.toArray(), []) || [];

  const [activeTab, setActiveTab] = useState<'produits' | 'achats'>('produits');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Tous');

  // Modal State for Add / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduit, setEditingProduit] = useState<Produit | null>(null);

  // Form State
  const [nom, setNom] = useState('');
  const [prix, setPrix] = useState('');
  const [stock, setStock] = useState('');
  const [codeBarres, setCodeBarres] = useState('');
  const [categorie, setCategorie] = useState('Smartphones');
  const [variantes, setVariantes] = useState('');
  const [minStock, setMinStock] = useState('5');
  const [productZoneId, setProductZoneId] = useState<number | ''>('');

  // Modal State for Purchase Restock
  const [isAchatModalOpen, setIsAchatModalOpen] = useState(false);
  const [selectedFournisseurId, setSelectedFournisseurId] = useState<number | ''>('');
  const [selectedProduitId, setSelectedProduitId] = useState<number | ''>('');
  const [achatQuantite, setAchatQuantite] = useState('10');
  const [achatCoutTotal, setAchatCoutTotal] = useState('');
  const [achatZoneId, setAchatZoneId] = useState<number | ''>('');

  // Categories
  const categories = categoriesDb.length > 0
    ? categoriesDb.map((category) => category.nom)
    : Array.from(new Set(produits.map((p) => p.categorie)));

  const handleOpenAddModal = () => {
    setEditingProduit(null);
    setNom('');
    setPrix('');
    setStock('');
    setCodeBarres('19425' + Math.floor(100000 + Math.random() * 900000));
    setCategorie('Smartphones');
    setVariantes('');
    setMinStock('5');
    setProductZoneId(activeZoneId ?? (zones.length === 1 ? zones[0].id || '' : ''));
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (p: Produit) => {
    setEditingProduit(p);
    setNom(p.nom);
    setPrix(p.prix.toString());
    setStock(p.stock.toString());
    setCodeBarres(p.code_barres);
    setCategorie(p.categorie);
    setVariantes((p.variantes || []).join(', '));
    setMinStock(p.min_stock.toString());
    setProductZoneId(p.zone_id || '');
    setIsModalOpen(true);
  };

  const handleSaveProduit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nom || !prix || !stock || !productZoneId) return;

    const numericPrix = parseFloat(prix);
    const numericStock = parseInt(stock, 10);
    const numericMinStock = parseInt(minStock, 10) || 5;
    const productVariantes = variantes
      .split(',')
      .map((variante) => variante.trim())
      .filter(Boolean);

    if (editingProduit && editingProduit.id) {
      const updated: Produit = {
        ...editingProduit,
        nom,
        prix: numericPrix,
        stock: numericStock,
        code_barres: codeBarres,
        categorie,
        variantes: productVariantes,
        min_stock: numericMinStock,
        zone_id: Number(productZoneId),
      };
      await db.produits.put(updated);
      await pushToSyncQueue('UPDATE', 'produits', updated);
    } else {
      const newProduit: Produit = {
        nom,
        prix: numericPrix,
        stock: numericStock,
        code_barres: codeBarres,
        categorie,
        variantes: productVariantes,
        min_stock: numericMinStock,
        zone_id: Number(productZoneId),
      };
      const newId = await db.produits.add(newProduit);
      await pushToSyncQueue('INSERT', 'produits', { id: newId, ...newProduit });
    }

    setIsModalOpen(false);
  };

  const handleDeleteProduit = async (id: number) => {
    if (confirm('Voulez-vous vraiment supprimer ce produit du catalogue ?')) {
      await db.produits.delete(id);
      await pushToSyncQueue('DELETE', 'produits', { id });
    }
  };

  // Restock purchase
  const handleSaveAchat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFournisseurId || !selectedProduitId || !achatQuantite || !achatCoutTotal || !achatZoneId) return;

    const fId = Number(selectedFournisseurId);
    const pId = Number(selectedProduitId);
    const qty = parseInt(achatQuantite, 10);
    const cout = parseFloat(achatCoutTotal);

    const targetFournisseur = fournisseurs.find((f) => f.id === fId);
    const targetProduit = produits.find((p) => p.id === pId);

    if (targetProduit && targetProduit.id) {
      // 1. Add Achat
      const newAchat = {
        date: new Date().toISOString(),
        fournisseur_id: fId,
        fournisseur_nom: targetFournisseur ? targetFournisseur.nom : 'Fournisseur',
        produit_id: pId,
        produit_nom: targetProduit.nom,
        quantite: qty,
        cout_total: cout,
        zone_id: Number(achatZoneId),
      };
      await db.achats_stock.add(newAchat);
      await pushToSyncQueue('INSERT', 'achats_stock', newAchat);

      // 2. Increase product stock
      const newStock = targetProduit.stock + qty;
      const coutUnitaire = cout / qty;
      await db.produits.update(pId, { stock: newStock, cout_achat_unitaire: coutUnitaire });
      await pushToSyncQueue('UPDATE', 'produits', {
        id: pId,
        stock: newStock,
        cout_achat_unitaire: coutUnitaire,
      });
    }

    setIsAchatModalOpen(false);
  };

  const filteredProduits = produits.filter((p) => {
    const matchSearch =
      p.nom.toLowerCase().includes(search.toLowerCase()) || p.code_barres.includes(search);
    const matchCat = categoryFilter === 'Tous' || p.categorie === categoryFilter;
    return matchSearch && matchCat && (activeZoneId === null || p.zone_id === activeZoneId);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Gestion du Stock & Produits
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Catalogue général, réapprovisionnements et historique des achats fournisseurs.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="glass"
            icon={<Truck className="w-4 h-4 text-emerald-500" />}
            onClick={() => {
              setAchatZoneId(activeZoneId ?? (zones.length === 1 ? zones[0].id || '' : ''));
              setIsAchatModalOpen(true);
            }}
          >
            Nouveau Réapprovisionnement
          </Button>
          <Button
            variant="primary"
            icon={<Plus className="w-4 h-4" />}
            onClick={handleOpenAddModal}
          >
            Nouveau Produit
          </Button>
        </div>
      </div>

      {/* Tabs bar */}
      <div className="flex items-center gap-2 border-b border-slate-200/50 dark:border-white/10 pb-2">
        <button
          onClick={() => setActiveTab('produits')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'produits'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'glass-card text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Catalogue Produits ({produits.length})
        </button>
        <button
          onClick={() => setActiveTab('achats')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'achats'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'glass-card text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Historique Achats Stock ({achats.length})
        </button>
      </div>

      {activeTab === 'produits' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher par nom, code-barres..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full glass-input pl-10 pr-4 py-2.5 rounded-2xl text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400">Catégorie:</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="glass-input px-3 py-2 rounded-xl text-xs font-medium text-slate-900 dark:text-white"
              >
                <option value="Tous">Toutes les catégories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Products Table */}
          <GlassCard className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/50 dark:border-white/10 bg-slate-50/50 dark:bg-slate-900/40 text-xs text-slate-500 uppercase tracking-wider">
                    <th className="p-4 font-semibold">Produit</th>
                    <th className="p-4 font-semibold">Code-Barres</th>
                    <th className="p-4 font-semibold">Catégorie</th>
                    <th className="p-4 font-semibold">Prix Unitaire</th>
                    <th className="p-4 font-semibold">État Stock</th>
                    <th className="p-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/40 dark:divide-white/5 text-sm">
                  {filteredProduits.map((p) => {
                    const isOutOfStock = p.stock <= 0;
                    const isLowStock = p.stock <= p.min_stock;

                    return (
                      <tr
                        key={p.id}
                        className="hover:bg-slate-100/40 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="p-4 font-bold text-slate-900 dark:text-white">
                          {p.nom}
                        </td>
                        <td className="p-4 font-mono text-xs text-slate-500 flex items-center gap-1.5">
                          <Barcode className="w-4 h-4 text-slate-400" />
                          {p.code_barres}
                        </td>
                        <td className="p-4">
                          <Badge variant="blue" size="sm">
                            {p.categorie}
                          </Badge>
                          {p.variantes && p.variantes.length > 0 && (
                            <div className="text-[11px] text-slate-400 mt-1">{p.variantes.length} variante(s)</div>
                          )}
                        </td>
                        <td className="p-4 font-extrabold text-blue-600 dark:text-blue-400">
                          {formatCfa(p.prix)}
                        </td>
                        <td className="p-4">
                          {isOutOfStock ? (
                            <Badge variant="red" dot size="sm">
                              Épuisé (0)
                            </Badge>
                          ) : isLowStock ? (
                            <Badge variant="amber" dot size="sm">
                              Stock bas ({p.stock})
                            </Badge>
                          ) : (
                            <Badge variant="green" size="sm">
                              En stock ({p.stock})
                            </Badge>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleOpenEditModal(p)}
                              className="p-2 rounded-xl glass-card hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                              title="Modifier"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => p.id && handleDeleteProduit(p.id)}
                              className="p-2 rounded-xl glass-card hover:bg-rose-500/20 text-rose-500"
                              title="Supprimer"
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
        </div>
      )}

      {activeTab === 'achats' && (
        <GlassCard className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200/50 dark:border-white/10 bg-slate-50/50 dark:bg-slate-900/40 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="p-4 font-semibold">Date</th>
                  <th className="p-4 font-semibold">Fournisseur</th>
                  <th className="p-4 font-semibold">Produit</th>
                  <th className="p-4 font-semibold">Quantité Réappro</th>
                  <th className="p-4 font-semibold">Coût Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/40 dark:divide-white/5 text-sm">
                {achats.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                      Aucun historique de réapprovisionnement enregistré.
                    </td>
                  </tr>
                ) : (
                  achats.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-100/40 dark:hover:bg-slate-800/30">
                      <td className="p-4 text-xs text-slate-400">
                        {new Date(a.date).toLocaleString('fr-FR')}
                      </td>
                      <td className="p-4 font-bold text-slate-900 dark:text-white">
                        {a.fournisseur_nom}
                      </td>
                      <td className="p-4 font-semibold text-slate-700 dark:text-slate-300">
                        {a.produit_nom}
                      </td>
                      <td className="p-4 font-extrabold text-emerald-600 dark:text-emerald-400">
                        +{a.quantite} unités
                      </td>
                      <td className="p-4 font-extrabold text-slate-900 dark:text-white">
                        {formatCfa(a.cout_total)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* ADD / EDIT PRODUCT MODAL */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingProduit ? 'Modifier le Produit' : 'Ajouter un Nouveau Produit'}
      >
        <form onSubmit={handleSaveProduit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
              Nom du produit
            </label>
            <input
              type="text"
              required
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="ex: MacBook Air M3 15"
              className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Zone / magasin</label>
            <select required value={productZoneId} onChange={(e) => setProductZoneId(e.target.value ? Number(e.target.value) : '')} className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm text-slate-900 dark:text-white">
              <option value="">-- Sélectionner une zone --</option>
              {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.nom} ({zone.code})</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
                Prix Vente (CFA)
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={prix}
                onChange={(e) => setPrix(e.target.value)}
                placeholder="999.00"
                className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-bold text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
                Stock Initial / Actuel
              </label>
              <input
                type="number"
                required
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                placeholder="10"
                className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-bold text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
              Variantes (séparées par des virgules)
            </label>
            <input
              type="text"
              value={variantes}
              onChange={(e) => setVariantes(e.target.value)}
              placeholder="ex: Noir, Blanc, 256 Go"
              className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Zone / magasin</label>
            <select required value={achatZoneId} onChange={(e) => setAchatZoneId(e.target.value ? Number(e.target.value) : '')} className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm text-slate-900 dark:text-white">
              <option value="">-- Sélectionner une zone --</option>
              {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.nom} ({zone.code})</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
                Catégorie
              </label>
              <input
                type="text"
                required
                value={categorie}
                onChange={(e) => setCategorie(e.target.value)}
                className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
                Seuil Alerte Stock Bas
              </label>
              <input
                type="number"
                required
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
                className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
              Code-Barres / EAN
            </label>
            <input
              type="text"
              required
              value={codeBarres}
              onChange={(e) => setCodeBarres(e.target.value)}
              className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-mono text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
              Annuler
            </Button>
            <Button variant="primary" type="submit">
              Enregistrer dans IndexedDB
            </Button>
          </div>
        </form>
      </Modal>

      {/* RESTOCK ACHAT MODAL */}
      <Modal
        isOpen={isAchatModalOpen}
        onClose={() => setIsAchatModalOpen(false)}
        title="Nouveau Réapprovisionnement Stock"
      >
        <form onSubmit={handleSaveAchat} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
              Fournisseur
            </label>
            <select
              required
              value={selectedFournisseurId}
              onChange={(e) => setSelectedFournisseurId(e.target.value ? Number(e.target.value) : '')}
              className="w-full glass-input px-3 py-2.5 rounded-xl text-sm text-slate-900 dark:text-white"
            >
              <option value="">-- Sélectionner un fournisseur --</option>
              {fournisseurs.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nom}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
              Produit à réapprovisionner
            </label>
            <select
              required
              value={selectedProduitId}
              onChange={(e) => setSelectedProduitId(e.target.value ? Number(e.target.value) : '')}
              className="w-full glass-input px-3 py-2.5 rounded-xl text-sm text-slate-900 dark:text-white"
            >
              <option value="">-- Sélectionner un produit --</option>
              {produits.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom} (Stock actuel: {p.stock})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
                Quantité ajoutée
              </label>
              <input
                type="number"
                required
                value={achatQuantite}
                onChange={(e) => setAchatQuantite(e.target.value)}
                className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-bold text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
                Coût Total d'Achat (CFA)
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={achatCoutTotal}
                onChange={(e) => setAchatCoutTotal(e.target.value)}
                placeholder="500.00"
                className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-bold text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3">
            <Button variant="ghost" onClick={() => setIsAchatModalOpen(false)}>
              Annuler
            </Button>
            <Button variant="primary" type="submit">
              Valider le Réapprovisionnement
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
