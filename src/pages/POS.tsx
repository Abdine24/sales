import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  Printer,
  CreditCard,
  Banknote,
  Receipt,
  UserCheck,
  AlertCircle,
  Package,
} from 'lucide-react';
import { db, Produit, Client, Vente } from '../db/db';
import { pushToSyncQueue } from '../hooks/useSync';
import { GlassCard } from '../components/ui/GlassCard';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { formatCfa } from '../utils/currency';

interface CartItem {
  produit: Produit;
  quantite: number;
  variante?: string;
}

interface POSProps {
  activeZoneId: number | null;
  vendeur: { id?: number; nom: string; identifiant: string };
}

export const POS: React.FC<POSProps> = ({ activeZoneId, vendeur }) => {
  const produits = useLiveQuery(() => db.produits.toArray(), []) || [];
  const clients = useLiveQuery(() => db.clients.toArray(), []) || [];

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Tous');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [variantProduct, setVariantProduct] = useState<Produit | null>(null);
  const [selectedVariant, setSelectedVariant] = useState('');

  // Modal Checkout & Receipt States
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'especes' | 'carte' | 'virement'>('carte');
  const [remiseInput, setRemiseInput] = useState<string>('0');
  const [montantPayeInput, setMontantPayeInput] = useState<string>('');
  const [completedSale, setCompletedSale] = useState<{ vente: Vente; items: CartItem[] } | null>(null);

  // Filter Categories
  const categories = useMemo(() => {
    const set = new Set(produits.map((p) => p.categorie));
    return ['Tous', ...Array.from(set)];
  }, [produits]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return produits.filter((p) => {
      const matchSearch =
        p.nom.toLowerCase().includes(search.toLowerCase()) ||
        p.code_barres.includes(search);
      const matchCat =
        selectedCategory === 'Tous' || p.categorie === selectedCategory;
      return matchSearch && matchCat && (activeZoneId === null || p.zone_id === activeZoneId);
    });
  }, [produits, search, selectedCategory, activeZoneId]);

  // Cart Totals
  const totalCart = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.produit.prix * item.quantite, 0);
  }, [cart]);

  const numericRemise = Math.min(Math.max(parseFloat(remiseInput) || 0, 0), totalCart);
  const totalApresRemise = Math.max(0, totalCart - numericRemise);

  // Add to cart
  const addToCart = (produit: Produit, variante?: string) => {
    if (produit.stock <= 0) return;
    setCart((prev) => {
      const existing = prev.find((i) => i.produit.id === produit.id && i.variante === variante);
      if (existing) {
        if (existing.quantite >= produit.stock) return prev; // max stock reached
        return prev.map((i) =>
          i.produit.id === produit.id && i.variante === variante ? { ...i, quantite: i.quantite + 1 } : i
        );
      } else {
        return [...prev, { produit, quantite: 1, variante }];
      }
    });
  };

  const handleProductClick = (produit: Produit) => {
    if (produit.variantes && produit.variantes.length > 0) {
      setVariantProduct(produit);
      setSelectedVariant(produit.variantes[0]);
      return;
    }
    addToCart(produit);
  };

  // Update cart item quantity
  const updateQuantity = (produitId: number, delta: number, variante?: string) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.produit.id === produitId && item.variante === variante) {
            const newQty = item.quantite + delta;
            if (newQty > item.produit.stock) return item;
            return newQty > 0 ? { ...item, quantite: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  // Open Checkout Modal
  const handleOpenCheckout = () => {
    if (cart.length === 0) return;
    setRemiseInput('0');
    setMontantPayeInput(totalCart.toString());
    setIsCheckoutOpen(true);
  };

  // Calculate debt or change
  const numericMontantPaye = parseFloat(montantPayeInput) || 0;
  const resteAPayer = Math.max(0, totalApresRemise - numericMontantPaye);
  const meRendre = Math.max(0, numericMontantPaye - totalApresRemise);

  // Validate Sale Execution
  const handleConfirmSale = async () => {
    if (cart.length === 0) return;

    if (resteAPayer > 0 && !selectedClientId) {
      alert('Veuillez sélectionner un client pour enregistrer le reste à payer en dette !');
      return;
    }

    const saleId = crypto.randomUUID();
    const nowISO = new Date().toISOString();
    const selectedClient = clients.find((c) => c.id === selectedClientId);

    let statut: 'paye' | 'partiel' | 'credit' = 'paye';
    if (resteAPayer > 0) {
      statut = numericMontantPaye === 0 ? 'credit' : 'partiel';
    }

    const newVente: Vente = {
      id: saleId,
      date: nowISO,
      client_id: selectedClientId,
      client_nom: selectedClient ? selectedClient.nom : 'Client Passant',
      total: totalApresRemise,
      remise: numericRemise,
      montant_paye: Math.min(numericMontantPaye, totalApresRemise),
      reste_a_payer: resteAPayer,
      statut,
      methode_paiement: paymentMethod,
      zone_id: activeZoneId,
      vendeur_id: vendeur.id ?? null,
      vendeur_nom: vendeur.nom,
      vendeur_identifiant: vendeur.identifiant,
    };

    // 1. Save Vente to Dexie
    await db.ventes.add(newVente);

    // 2. Save Lignes de Vente & Decrement Stock
    for (const item of cart) {
      if (item.produit.id) {
        await db.lignes_vente.add({
          vente_id: saleId,
          produit_id: item.produit.id,
          produit_nom: item.produit.nom,
          variante: item.variante,
          quantite: item.quantite,
          prix_unitaire: item.produit.prix,
          cout_unitaire: item.produit.cout_achat_unitaire,
        });

        // Update local stock
        const newStock = Math.max(0, item.produit.stock - item.quantite);
        await db.produits.update(item.produit.id, { stock: newStock });
      }
    }

    // 3. Update Client Debt if partial/credit payment
    if (selectedClient && selectedClient.id && resteAPayer > 0) {
      const updatedDebt = (selectedClient.total_dette || 0) + resteAPayer;
      await db.clients.update(selectedClient.id, { total_dette: updatedDebt });
      await pushToSyncQueue('UPDATE', 'clients', {
        id: selectedClient.id,
        total_dette: updatedDebt,
      });
    }

    // 4. Push Vente to Sync Queue
    await pushToSyncQueue('INSERT', 'ventes', newVente);

    // 5. Trigger Confetti
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
    });

    // 6. Set receipt state & reset cart
    setCompletedSale({ vente: newVente, items: [...cart] });
    setIsCheckoutOpen(false);
    setCart([]);
  };

  return (
    <div className="h-[calc(100vh-4rem)] min-h-0 flex flex-col lg:flex-row gap-4 lg:gap-6">
      {/* LEFT COLUMN: Product Catalog */}
      <div className="flex-1 flex flex-col min-w-0 space-y-4">
        {/* Search & Category Filter Header */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          {/* Search bar */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher par nom ou scanner un code-barres..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full glass-input pl-10 pr-4 py-2.5 rounded-2xl text-sm text-slate-900 dark:text-white"
            />
          </div>

          {/* Category Badges */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  selectedCategory === cat
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'glass-card text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-3 gap-4">
          {filteredProducts.map((produit) => {
            const inCart = cart.filter((i) => i.produit.id === produit.id).reduce((sum, item) => sum + item.quantite, 0);
            const isOutOfStock = produit.stock <= 0;
            const isLowStock = produit.stock <= produit.min_stock;

            return (
              <motion.div
                key={produit.id}
                whileHover={isOutOfStock ? undefined : { scale: 1.02, y: -2 }}
                whileTap={isOutOfStock ? undefined : { scale: 0.96 }}
                onClick={() => !isOutOfStock && handleProductClick(produit)}
                className={`glass-card rounded-2xl p-4 flex flex-col justify-between cursor-pointer relative overflow-hidden transition-all border ${
                  inCart > 0
                    ? 'ring-2 ring-blue-500 border-blue-400 dark:border-blue-500 bg-blue-500/5'
                    : isOutOfStock
                    ? 'opacity-50 cursor-not-allowed border-rose-300 dark:border-rose-950'
                    : 'hover:border-blue-300 dark:hover:border-white/20'
                }`}
              >
                {/* Product Badge Header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <Package className="w-5 h-5" />
                  </div>
                  {isOutOfStock ? (
                    <Badge variant="red" size="sm">
                      Épuisé
                    </Badge>
                  ) : isLowStock ? (
                    <Badge variant="amber" size="sm">
                      Reste {produit.stock}
                    </Badge>
                  ) : (
                    <Badge variant="gray" size="sm">
                      Stock: {produit.stock}
                    </Badge>
                  )}
                </div>

                {/* Info */}
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-2 leading-snug">
                    {produit.nom}
                  </h4>
                  <p className="text-xs text-slate-400">{produit.categorie}</p>
                </div>

                {/* Price & Quantity Indicator */}
                <div className="mt-3 pt-2 border-t border-slate-200/50 dark:border-white/10 flex items-center justify-between">
                  <span className="text-base font-extrabold text-blue-600 dark:text-blue-400">
                    {formatCfa(produit.prix)}
                  </span>
                  {inCart > 0 && (
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-extrabold text-xs flex items-center justify-center shadow-md">
                      {inCart}
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* RIGHT COLUMN: Interactive Ticket / Cart */}
      <GlassCard className="w-full lg:w-96 flex flex-col h-full p-5 border-l border-white/20">
        {/* Ticket Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200/50 dark:border-white/10">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-blue-500" />
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">
              Ticket de Caisse
            </h3>
          </div>
          {cart.length > 0 && (
            <button
              onClick={() => setCart([])}
              className="text-xs text-rose-500 hover:text-rose-600 font-semibold flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" /> Vider
            </button>
          )}
        </div>

        {/* Client Selection Selector */}
        <div className="my-3 space-y-1">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <UserCheck className="w-3.5 h-3.5 text-blue-500" /> Client (Obligatoire si dette)
          </label>
          <select
            value={selectedClientId || ''}
            onChange={(e) =>
              setSelectedClientId(e.target.value ? Number(e.target.value) : null)
            }
            className="w-full glass-input px-3 py-2 rounded-xl text-xs text-slate-900 dark:text-white"
          >
            <option value="">-- Client Passant (Sans dette) --</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom} {c.total_dette > 0 ? `(Dette: ${formatCfa(c.total_dette)})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Cart Item List */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 my-2">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 p-6">
              <Receipt className="w-12 h-12 stroke-1 opacity-40 mb-2" />
              <p className="text-sm font-medium">Le panier est vide</p>
              <p className="text-xs opacity-75">Cliquez sur un produit pour l'ajouter à la caisse.</p>
            </div>
          ) : (
            <AnimatePresence>
              {cart.map((item) => (
                <motion.div
                  key={`${item.produit.id}-${item.variante || 'default'}`}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-100/60 dark:bg-slate-800/40 border border-slate-200/40 dark:border-white/5"
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {item.produit.nom}
                    </h5>
                    <span className="text-[11px] text-slate-400">
                      {item.variante ? `${item.variante} · ` : ''}{formatCfa(item.produit.prix)} × {item.quantite}
                    </span>
                  </div>

                  {/* Quantity Controls */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => item.produit.id && updateQuantity(item.produit.id, -1, item.variante)}
                      className="p-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-6 text-center text-xs font-bold">
                      {item.quantite}
                    </span>
                    <button
                      onClick={() => item.produit.id && updateQuantity(item.produit.id, 1, item.variante)}
                      className="p-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Footer Checkout Summary */}
        <div className="pt-4 border-t border-slate-200/50 dark:border-white/10 space-y-3">
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Nombre d'articles</span>
              <span>{cart.reduce((s, i) => s + i.quantite, 0)}</span>
            </div>
            <div className="flex justify-between text-lg font-black text-slate-900 dark:text-white">
              <span>Total TTC</span>
              <span className="text-blue-600 dark:text-blue-400">
                {formatCfa(totalCart)}
              </span>
            </div>
          </div>

          <Button
            variant="primary"
            size="lg"
            className="w-full font-bold shadow-lg shadow-blue-500/25"
            disabled={cart.length === 0}
            onClick={handleOpenCheckout}
          >
            Valider le Règlement ({formatCfa(totalCart)})
          </Button>
        </div>
      </GlassCard>

      {/* VARIANT SELECTION MODAL */}
      <Modal
        isOpen={!!variantProduct}
        onClose={() => setVariantProduct(null)}
        title={`Choisir une variante - ${variantProduct?.nom || ''}`}
      >
        {variantProduct && (
          <div className="space-y-4">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block">
              Variante du produit
            </label>
            <select
              value={selectedVariant}
              onChange={(event) => setSelectedVariant(event.target.value)}
              className="w-full glass-input px-3 py-3 rounded-xl text-sm text-slate-900 dark:text-white"
            >
              {(variantProduct.variantes || []).map((variante) => (
                <option key={variante} value={variante}>{variante}</option>
              ))}
            </select>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setVariantProduct(null)}>Annuler</Button>
              <Button
                variant="primary"
                onClick={() => {
                  addToCart(variantProduct, selectedVariant);
                  setVariantProduct(null);
                }}
              >
                Ajouter au panier
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* CHECKOUT MODAL */}
      <Modal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        title="Finaliser la Vente & Règlement"
      >
        <div className="space-y-5">
          {/* Total Display */}
          <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-center">
            <span className="text-xs uppercase font-bold text-slate-500 dark:text-slate-400">
              Total à Payer après remise
            </span>
            <div className="text-3xl font-black text-blue-600 dark:text-blue-400 mt-1">
              {formatCfa(totalApresRemise)}
            </div>
            {numericRemise > 0 && (
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Sous-total {formatCfa(totalCart)} - remise {formatCfa(numericRemise)}
              </div>
            )}
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 block">
              Moyen de Paiement
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setPaymentMethod('carte')}
                className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                  paymentMethod === 'carte'
                    ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                    : 'glass-card text-slate-600 dark:text-slate-400'
                }`}
              >
                <CreditCard className="w-5 h-5" /> Carte Bancaire
              </button>
              <button
                onClick={() => setPaymentMethod('especes')}
                className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                  paymentMethod === 'especes'
                    ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                    : 'glass-card text-slate-600 dark:text-slate-400'
                }`}
              >
                <Banknote className="w-5 h-5" /> Espèces
              </button>
              <button
                onClick={() => setPaymentMethod('virement')}
                className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                  paymentMethod === 'virement'
                    ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                    : 'glass-card text-slate-600 dark:text-slate-400'
                }`}
              >
                <Receipt className="w-5 h-5" /> Virement / Autre
              </button>
            </div>
          </div>

          {/* Discount, amount paid and balance */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
                Remise (CFA)
              </label>
              <input
                type="number"
                min="0"
                max={totalCart}
                step="0.01"
                value={remiseInput}
                onChange={(e) => setRemiseInput(e.target.value)}
                className="w-full glass-input px-4 py-3 rounded-2xl text-lg font-bold text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
                Montant Versé par le Client (CFA)
              </label>
              <input
                type="number"
                step="0.01"
                value={montantPayeInput}
                onChange={(e) => setMontantPayeInput(e.target.value)}
                className="w-full glass-input px-4 py-3 rounded-2xl text-lg font-bold text-slate-900 dark:text-white"
              />
            </div>

            {/* Partial / Debt Alert Indicator */}
            {resteAPayer > 0 && (
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>Paiement Partiel (Dette de {formatCfa(resteAPayer)})</span>
                </div>
                <p>
                  {selectedClientId
                    ? `Le solde de ${formatCfa(resteAPayer)} sera automatiquement ajouté au compte du client.`
                    : '⚠️ Veuillez fermer la fenêtre et sélectionner un client pour enregistrer cette dette !'}
                </p>
              </div>
            )}

            {meRendre > 0 && (
              <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex justify-between">
                <span>Rendre au client :</span>
                <span className="text-sm">{formatCfa(meRendre)}</span>
              </div>
            )}
          </div>

          {/* Confirm Action */}
          <div className="flex items-center justify-end gap-3 pt-3">
            <Button variant="ghost" onClick={() => setIsCheckoutOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              size="lg"
              onClick={handleConfirmSale}
              disabled={resteAPayer > 0 && !selectedClientId}
            >
              Confirmer & Imprimer le Reçu
            </Button>
          </div>
        </div>
      </Modal>

      {/* COMPLETED SALE RECEIPT MODAL */}
      {completedSale && (
        <Modal
          isOpen={!!completedSale}
          onClose={() => setCompletedSale(null)}
          title="Reçu de Caisse - Vente Validée"
        >
          <div className="space-y-4">
            <div className="text-center p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-1" />
              <h4 className="font-bold text-slate-900 dark:text-white">
                Vente Enregistrée en Local (IndexedDB)
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Réf: {completedSale.vente.id.substring(0, 8)} •{' '}
                {new Date(completedSale.vente.date).toLocaleString('fr-FR')}
              </p>
            </div>

            {/* Receipt Item List */}
            <div className="border border-dashed border-slate-300 dark:border-slate-700 p-4 rounded-2xl space-y-2 text-xs">
              <div className="flex justify-between font-bold pb-2 border-b border-slate-200 dark:border-slate-800">
                <span>Client: {completedSale.vente.client_nom}</span>
                <span>Mode: {completedSale.vente.methode_paiement.toUpperCase()}</span>
              </div>
              {completedSale.items.map((item, idx) => (
                <div key={idx} className="flex justify-between">
                  <span>
                    {item.produit.nom}{item.variante ? ` - ${item.variante}` : ''} ({item.quantite}x)
                  </span>
                  <span className="font-semibold">
                    {formatCfa(item.produit.prix * item.quantite)}
                  </span>
                </div>
              ))}

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1">
                {completedSale.vente.remise ? (
                  <div className="flex justify-between text-slate-400">
                    <span>Remise :</span>
                    <span>{formatCfa(completedSale.vente.remise)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between font-bold text-sm">
                  <span>Total :</span>
                  <span>{formatCfa(completedSale.vente.total)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Payé :</span>
                  <span>{formatCfa(completedSale.vente.montant_paye)}</span>
                </div>
                {completedSale.vente.reste_a_payer > 0 && (
                  <div className="flex justify-between font-bold text-rose-500">
                    <span>Ajouté en Dette Client :</span>
                    <span>{formatCfa(completedSale.vente.reste_a_payer)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button
                variant="glass"
                icon={<Printer className="w-4 h-4" />}
                onClick={() => window.print()}
              >
                Imprimer le Reçu
              </Button>
              <Button variant="primary" onClick={() => setCompletedSale(null)}>
                Terminer
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
