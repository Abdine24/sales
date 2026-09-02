import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { FolderKanban, Layers3, Plus, Edit2, Trash2 } from 'lucide-react';
import { db, Categorie, Produit } from '../db/db';
import { pushToSyncQueue } from '../hooks/useSync';
import { GlassCard } from '../components/ui/GlassCard';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { useDialog } from '../components/ui/DialogProvider';

export const Categories: React.FC = () => {
  const { confirm, alert } = useDialog();
  const categories = useLiveQuery(() => db.categories.orderBy('nom').toArray(), []) || [];
  const produits = useLiveQuery(() => db.produits.toArray(), []) || [];
  const [activeTab, setActiveTab] = useState<'categories' | 'variantes'>('categories');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Categorie | null>(null);
  const [nom, setNom] = useState('');
  const [description, setDescription] = useState('');
  const [isVariantModalOpen, setIsVariantModalOpen] = useState(false);
  const [editingVariant, setEditingVariant] = useState<string | null>(null);
  const [variantName, setVariantName] = useState('');
  const [variantProductId, setVariantProductId] = useState<number | ''>('');

  const variants = Array.from(
    new Set(produits.flatMap((produit) => produit.variantes || []).filter(Boolean))
  ).sort((first, second) => first.localeCompare(second));

  const openModal = (category?: Categorie) => {
    setEditingCategory(category || null);
    setNom(category?.nom || '');
    setDescription(category?.description || '');
    setIsModalOpen(true);
  };

  const saveCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedName = nom.trim();
    if (!normalizedName) return;
    const duplicate = categories.find(
      (category) => category.nom.toLowerCase() === normalizedName.toLowerCase() && category.id !== editingCategory?.id
    );
    if (duplicate) {
      await alert('Cette catégorie existe déjà.');
      return;
    }

    if (editingCategory?.id) {
      const updated = { ...editingCategory, nom: normalizedName, description };
      await db.categories.put(updated);
      await db.produits.where('categorie').equals(editingCategory.nom).modify({ categorie: normalizedName });
      await pushToSyncQueue('UPDATE', 'categories', updated);
    } else {
      const category = { nom: normalizedName, description };
      const id = await db.categories.add(category);
      await pushToSyncQueue('INSERT', 'categories', { id, ...category });
    }
    setIsModalOpen(false);
  };

  const deleteCategory = async (category: Categorie) => {
    if (produits.some((produit) => produit.categorie === category.nom)) {
      await alert('Impossible de supprimer une catégorie utilisée par un produit.');
      return;
    }
    if (!category.id) return;
    const ok = await confirm({
      title: 'Supprimer la catégorie',
      message: `Supprimer la catégorie « ${category.nom} » ?`,
      danger: true,
      confirmLabel: 'Supprimer',
    });
    if (!ok) return;
    await db.categories.delete(category.id);
    await pushToSyncQueue('DELETE', 'categories', { id: category.id });
  };

  const openVariantModal = (variant?: string) => {
    setEditingVariant(variant || null);
    setVariantName(variant || '');
    setVariantProductId('');
    setIsVariantModalOpen(true);
  };

  const saveVariant = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedName = variantName.trim();
    if (!normalizedName) return;

    if (editingVariant) {
      if (variants.some((variant) => variant.toLowerCase() === normalizedName.toLowerCase() && variant !== editingVariant)) {
        await alert('Cette variante existe déjà.');
        return;
      }
      const affectedProducts = produits.filter((produit) => produit.variantes?.includes(editingVariant));
      for (const produit of affectedProducts) {
        if (!produit.id) continue;
        const updated: Produit = {
          ...produit,
          variantes: (produit.variantes || []).map((variant) => variant === editingVariant ? normalizedName : variant),
        };
        await db.produits.put(updated);
        await pushToSyncQueue('UPDATE', 'produits', updated);
      }
    } else {
      if (!variantProductId) return;
      const produit = produits.find((item) => item.id === Number(variantProductId));
      if (!produit?.id) return;
      if (produit.variantes?.some((variant) => variant.toLowerCase() === normalizedName.toLowerCase())) {
        await alert('Ce produit possède déjà cette variante.');
        return;
      }
      const updated: Produit = { ...produit, variantes: [...(produit.variantes || []), normalizedName] };
      await db.produits.put(updated);
      await pushToSyncQueue('UPDATE', 'produits', updated);
    }
    setIsVariantModalOpen(false);
  };

  const deleteVariant = async (variant: string) => {
    const ok = await confirm({
      title: 'Supprimer la variante',
      message: `Supprimer la variante « ${variant} » de tous les produits ?`,
      danger: true,
      confirmLabel: 'Supprimer',
    });
    if (!ok) return;
    const affectedProducts = produits.filter((produit) => produit.variantes?.includes(variant));
    for (const produit of affectedProducts) {
      if (!produit.id) continue;
      const updated: Produit = {
        ...produit,
        variantes: (produit.variantes || []).filter((item) => item !== variant),
      };
      await db.produits.put(updated);
      await pushToSyncQueue('UPDATE', 'produits', updated);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Catégories & Variantes</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Organisez vos produits et leurs déclinaisons depuis un seul endroit.</p>
        </div>
        <Button
          variant="primary"
          icon={<Plus className="w-4 h-4" />}
          onClick={() => activeTab === 'categories' ? openModal() : openVariantModal()}
        >
          {activeTab === 'categories' ? 'Nouvelle catégorie' : 'Nouvelle variante'}
        </Button>
      </div>

      <div className="flex items-center gap-2 border-b border-slate-200/50 dark:border-white/10 pb-2">
        <button onClick={() => setActiveTab('categories')} className={`px-4 py-2 rounded-xl text-sm font-bold ${activeTab === 'categories' ? 'bg-emerald-600 text-white' : 'glass-card text-slate-600 dark:text-slate-400'}`}>
          Catégories ({categories.length})
        </button>
        <button onClick={() => setActiveTab('variantes')} className={`px-4 py-2 rounded-xl text-sm font-bold ${activeTab === 'variantes' ? 'bg-emerald-600 text-white' : 'glass-card text-slate-600 dark:text-slate-400'}`}>
          Variantes ({variants.length})
        </button>
      </div>

      {activeTab === 'categories' && (
      <GlassCard className="p-0 overflow-hidden">
        <div className="divide-y divide-slate-200/40 dark:divide-white/5">
          {categories.map((category) => {
            const count = produits.filter((produit) => produit.categorie === category.nom).length;
            return (
              <div key={category.id} className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                    <FolderKanban className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">{category.nom}</div>
                    <div className="text-xs text-slate-500">{category.description || 'Aucune description'} · {count} produit(s)</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openModal(category)} className="p-2 rounded-xl glass-card text-emerald-600" title="Modifier">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => deleteCategory(category)} className="p-2 rounded-xl glass-card text-rose-500" title="Supprimer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>
      )}

      {activeTab === 'variantes' && (
        <GlassCard className="p-0 overflow-hidden">
          <div className="divide-y divide-slate-200/40 dark:divide-white/5">
            {variants.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">Aucune variante enregistrée.</div>
            ) : variants.map((variant) => {
              const variantProducts = produits.filter((produit) => produit.variantes?.includes(variant));
              return (
                <div key={variant} className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
                      <Layers3 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">{variant}</div>
                      <div className="text-xs text-slate-500">{variantProducts.map((produit) => produit.nom).join(', ')}</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openVariantModal(variant)} className="p-2 rounded-xl glass-card text-emerald-600" title="Renommer">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteVariant(variant)} className="p-2 rounded-xl glass-card text-rose-500" title="Supprimer">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingCategory ? 'Modifier la catégorie' : 'Nouvelle catégorie'}>
        <form onSubmit={saveCategory} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Nom</label>
            <input required value={nom} onChange={(event) => setNom(event.target.value)} className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Description</label>
            <input value={description} onChange={(event) => setDescription(event.target.value)} className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm" />
          </div>
          <div className="flex justify-end gap-3 pt-3">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Annuler</Button>
            <Button variant="primary" type="submit">Enregistrer</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isVariantModalOpen} onClose={() => setIsVariantModalOpen(false)} title={editingVariant ? 'Renommer la variante' : 'Nouvelle variante'}>
        <form onSubmit={saveVariant} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Nom de la variante</label>
            <input required value={variantName} onChange={(event) => setVariantName(event.target.value)} placeholder="ex: Noir, 256 Go, XL" className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm" />
          </div>
          {!editingVariant && (
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Produit concerné</label>
              <select required value={variantProductId} onChange={(event) => setVariantProductId(event.target.value ? Number(event.target.value) : '')} className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm text-slate-900 dark:text-white">
                <option value="">-- Sélectionner un produit --</option>
                {produits.map((produit) => <option key={produit.id} value={produit.id}>{produit.nom}</option>)}
              </select>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-3">
            <Button variant="ghost" onClick={() => setIsVariantModalOpen(false)}>Annuler</Button>
            <Button variant="primary" type="submit">Enregistrer</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};