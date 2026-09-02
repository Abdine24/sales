import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  Printer,
  Smartphone,
  Banknote,
  Receipt,
  UserCheck,
  AlertCircle,
  Package,
  Clock,
  ArchiveRestore,
  Layers,
  ShoppingBag,
  X,
  Camera,
  Barcode as BarcodeIcon,
  MessageSquare,
  Send,
  Download,
  Landmark,
} from 'lucide-react';
import type { Produit, VarianteProduit, Client, Vente, PanierLigne, PanierEnAttente, AppSettings } from '../db/db';
import { apiGet, apiPost, apiDelete, ApiError } from '../services/api';
import { useGlobalBarcodeScanner } from '../hooks/useGlobalBarcodeScanner';
import { GlassCard } from '../components/ui/GlassCard';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { useDialog } from '../components/ui/DialogProvider';
import { ReceiptPrint, ReceiptData } from '../components/ReceiptPrint';
import { ProductCard, AddToCartPayload } from '../components/ProductCard';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';
import { formatCfa, parseAmount } from '../utils/currency';
import { openWhatsAppReceipt } from '../utils/whatsapp';
import { generateInvoiceA4Pdf } from '../utils/pdfInvoice';

type CartItem = PanierLigne;

interface POSProps {
  activeZoneId: number | null;
  vendeur: { id?: number; nom: string; identifiant: string };
}

export const POS: React.FC<POSProps> = ({ activeZoneId, vendeur }) => {
  const { confirm, alert } = useDialog();
  const [produits, setProduits] = useState<Produit[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [paniersEnAttenteAll, setPaniersEnAttenteAll] = useState<PanierEnAttente[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [p, c, s, panels] = await Promise.all([
        apiGet<Produit[]>('/produits'),
        apiGet<Client[]>('/clients'),
        apiGet<AppSettings>('/settings'),
        apiGet<PanierEnAttente[]>('/paniers-en-attente'),
      ]);
      setProduits(p);
      setClients(c);
      setSettings(s);
      setPaniersEnAttenteAll(panels);
    } catch (err) {
      await alert(err instanceof ApiError ? err.message : 'Impossible de charger la caisse.');
    } finally {
      setLoading(false);
    }
  }, [alert]);

  useEffect(() => {
    reload();
  }, [reload]);

  const paniersEnAttente = useMemo(
    () => paniersEnAttenteAll.filter((p) => !vendeur?.id || p.vendeur_id === vendeur.id || p.vendeur_id === null),
    [paniersEnAttenteAll, vendeur?.id]
  );

  const [search, setSearch] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('Tous');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [selectedVariableProduct, setSelectedVariableProduct] = useState<Produit | null>(null);
  const [modalAttributes, setModalAttributes] = useState<Record<string, string>>({});
  const [modalQuantity, setModalQuantity] = useState<number>(1);

  const [isPanierModalOpen, setIsPanierModalOpen] = useState(false);
  const [panierReference, setPanierReference] = useState('');
  const [showPanierList, setShowPanierList] = useState(false);
  const [printFormat, setPrintFormat] = useState<'a4' | 'thermique'>('thermique');

  React.useEffect(() => {
    if (settings?.print_format_default) {
      setPrintFormat(settings.print_format_default);
    }
  }, [settings?.print_format_default]);

  // Modal Checkout & Receipt States
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'especes' | 'mobile_money' | 'virement'>('especes');
  const [remiseInput, setRemiseInput] = useState<string>('0');
  const [montantPayeInput, setMontantPayeInput] = useState<string>('');
  const [completedSale, setCompletedSale] = useState<{
    vente: Vente;
    items: CartItem[];
    clientTelephone?: string;
    clientNom?: string;
  } | null>(null);
  const [completedPhoneInput, setCompletedPhoneInput] = useState<string>('');

  const handleOpenVariableModal = (produit: Produit) => {
    setSelectedVariableProduct(produit);
    setModalQuantity(1);
    if (produit.attributs && produit.attributs.length > 0) {
      const initAttrs: Record<string, string> = {};
      produit.attributs.forEach((attr) => {
        if (attr.valeurs && attr.valeurs.length > 0) {
          initAttrs[attr.nom] = attr.valeurs[0];
        }
      });
      setModalAttributes(initAttrs);
    } else {
      setModalAttributes({});
    }
  };

  const modalResolvedVariant = useMemo<VarianteProduit | null>(() => {
    if (!selectedVariableProduct || !selectedVariableProduct.variantes_detaillees || selectedVariableProduct.variantes_detaillees.length === 0) {
      return null;
    }
    const matched = selectedVariableProduct.variantes_detaillees.find((v) =>
      Object.entries(modalAttributes).every(
        ([nomAttr, valAttr]) => v.attributs && v.attributs[nomAttr] === valAttr
      )
    );
    return matched || selectedVariableProduct.variantes_detaillees[0];
  }, [selectedVariableProduct, modalAttributes]);

  const modalVariantLabel = useMemo(() => {
    if (!modalResolvedVariant || !modalResolvedVariant.attributs) return '';
    return Object.entries(modalResolvedVariant.attributs)
      .map(([k, v]) => `${k}: ${v}`)
      .join(' · ');
  }, [modalResolvedVariant]);

  const handleAddModalVariantToCart = () => {
    if (!selectedVariableProduct || !modalResolvedVariant || !selectedVariableProduct.id) return;
    if ((modalResolvedVariant.stock ?? 0) <= 0 || modalQuantity <= 0) return;

    handleProductCardAddToCart({
      type: 'variable',
      productId: selectedVariableProduct.id,
      variantId: modalResolvedVariant.id,
      produit: selectedVariableProduct,
      variante: modalResolvedVariant,
      varianteLabel: modalVariantLabel || 'Variante',
      prix: Number(modalResolvedVariant.prix) || 0,
      quantite: modalQuantity,
    });

    setSelectedVariableProduct(null);
  };

  const handleMettreEnAttente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!panierReference.trim() || cart.length === 0) return;
    try {
      await apiPost('/paniers-en-attente', {
        nom_reference: panierReference,
        lignes: cart,
        total: totalCart,
        vendeur_id: vendeur.id ?? null,
      });
      setCart([]);
      setPanierReference('');
      setIsPanierModalOpen(false);
      await reload();
    } catch (err) {
      await alert(err instanceof ApiError ? err.message : 'Échec de la mise en attente.');
    }
  };

  const handleRestaurerPanier = async (id: number) => {
    const panier = paniersEnAttenteAll.find((p) => p.id === id);
    if (panier) {
      if (cart.length > 0) {
        const ok = await confirm('Cela va écraser le panier en cours. Voulez-vous continuer ?');
        if (!ok) return;
      }
      // Ré-hydrate les produits depuis la base : prix / stock à jour, articles supprimés retirés
      const restored = panier.lignes
        .map((ligne) => {
          const current = produits.find((p) => p.id === ligne.produit.id);
          return current ? { ...ligne, produit: current } : null;
        })
        .filter((ligne): ligne is CartItem => ligne !== null);
      setCart(restored);
      try {
        await apiDelete(`/paniers-en-attente/${id}`);
        await reload();
      } catch {
        // Le panier reste restauré côté UI même si la suppression serveur échoue.
      }
      setShowPanierList(false);
    }
  };

  const handleDeletePanier = async (id: number) => {
    const ok = await confirm({
      message: 'Supprimer ce panier en attente ?',
      danger: true,
      confirmLabel: 'Supprimer',
    });
    if (!ok) return;
    try {
      await apiDelete(`/paniers-en-attente/${id}`);
      await reload();
    } catch (err) {
      await alert(err instanceof ApiError ? err.message : 'Échec de la suppression.');
    }
  };

  // Filter Categories
  const categories = useMemo(() => {
    const set = new Set(produits.map((p) => p.categorie || 'Général'));
    return ['Tous', ...Array.from(set)];
  }, [produits]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return produits.filter((p) => {
      const pNom = (p.nom || '').toLowerCase();
      const pCode = (p.code_barres || '').toLowerCase();
      const searchLower = search.toLowerCase().trim();
      const matchSearch =
        searchLower === '' ||
        pNom.includes(searchLower) ||
        pCode.includes(searchLower);
      const matchCat =
        selectedCategory === 'Tous' || (p.categorie || 'Général') === selectedCategory;
      return matchSearch && matchCat && (activeZoneId === null || !p.zone_id || p.zone_id === activeZoneId);
    });
  }, [produits, search, selectedCategory, activeZoneId]);

  // Cart Totals
  const totalCart = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.prix_unitaire ?? item.produit.prix) * item.quantite, 0);
  }, [cart]);

  const numericRemise = Math.min(Math.max(parseAmount(remiseInput), 0), totalCart);
  const totalApresRemise = Math.max(0, totalCart - numericRemise);

  // Add to cart from ProductCard or Modal (Simple or Variable)
  const handleProductCardAddToCart = (payload: AddToCartPayload) => {
    const qtyToAdd = payload.quantite && payload.quantite > 0 ? payload.quantite : 1;
    if (payload.type === 'simple') {
      const produit = payload.produit;
      if ((produit.stock ?? 0) <= 0) return;
      setCart((prev) => {
        const existingIndex = prev.findIndex(
          (i) => i.produit.id === payload.productId && !i.variant_id
        );
        if (existingIndex > -1) {
          const item = prev[existingIndex];
          if (item.quantite + qtyToAdd > produit.stock) {
            const maxAdd = Math.max(0, produit.stock - item.quantite);
            if (maxAdd <= 0) return prev;
            const copy = [...prev];
            copy[existingIndex] = { ...item, quantite: item.quantite + maxAdd };
            return copy;
          }
          const copy = [...prev];
          copy[existingIndex] = { ...item, quantite: item.quantite + qtyToAdd };
          return copy;
        }
        return [
          ...prev,
          {
            produit,
            quantite: Math.min(qtyToAdd, produit.stock),
            prix_unitaire: payload.prix,
          },
        ];
      });
    } else {
      // Variable product
      const { produit, variante, variantId, varianteLabel, prix } = payload;
      if ((variante.stock ?? 0) <= 0) return;
      setCart((prev) => {
        const existingIndex = prev.findIndex(
          (i) => i.produit.id === payload.productId && i.variant_id === variantId
        );
        if (existingIndex > -1) {
          const item = prev[existingIndex];
          if (item.quantite + qtyToAdd > variante.stock) {
            const maxAdd = Math.max(0, variante.stock - item.quantite);
            if (maxAdd <= 0) return prev;
            const copy = [...prev];
            copy[existingIndex] = { ...item, quantite: item.quantite + maxAdd };
            return copy;
          }
          const copy = [...prev];
          copy[existingIndex] = { ...item, quantite: item.quantite + qtyToAdd };
          return copy;
        }
        return [
          ...prev,
          {
            produit,
            quantite: Math.min(qtyToAdd, variante.stock),
            variant_id: variantId,
            variante: varianteLabel,
            prix_unitaire: prix,
          },
        ];
      });
    }
  };

  // Fallback simple click (ex: barcode scanner)
  const handleProductClick = (produit: Produit) => {
    if (produit.is_variable && produit.variantes_detaillees && produit.variantes_detaillees.length > 0) {
      const firstVar = produit.variantes_detaillees[0];
      const label = Object.entries(firstVar.attributs).map(([k, v]) => `${k}: ${v}`).join(' · ');
      handleProductCardAddToCart({
        type: 'variable',
        productId: produit.id!,
        variantId: firstVar.id,
        produit,
        variante: firstVar,
        varianteLabel: label,
        prix: firstVar.prix,
      });
      return;
    }
    if (produit.id) {
      handleProductCardAddToCart({
        type: 'simple',
        productId: produit.id,
        produit,
        prix: produit.prix,
      });
    }
  };

  // Traitement direct lors d'un scan de code-barres (Caméra ou Douchette)
  const handleBarcodeScan = (scannedCode: string) => {
    const query = scannedCode.trim();
    if (!query) return;

    let matchedProduct: Produit | undefined = undefined;
    let matchedVariant: VarianteProduit | undefined = undefined;

    for (const p of produits) {
      if (p.is_variable && p.variantes_detaillees) {
        const v = p.variantes_detaillees.find((vr) => vr.code_barres === query);
        if (v) {
          matchedProduct = p;
          matchedVariant = v;
          break;
        }
      }
      if (p.code_barres === query) {
        matchedProduct = p;
        break;
      }
    }

    if (matchedProduct) {
      if (matchedVariant) {
        const label = Object.entries(matchedVariant.attributs || {}).map(([k, v]) => `${k}: ${v}`).join(' · ');
        handleProductCardAddToCart({
          type: 'variable',
          productId: matchedProduct.id!,
          variantId: matchedVariant.id,
          produit: matchedProduct,
          variante: matchedVariant,
          varianteLabel: label,
          prix: Number(matchedVariant.prix) || 0,
          quantite: 1,
        });
      } else {
        handleProductCardAddToCart({
          type: 'simple',
          productId: matchedProduct.id!,
          produit: matchedProduct,
          prix: Number(matchedProduct.prix) || 0,
          quantite: 1,
        });
      }
      setSearch('');
    } else {
      // Si aucun produit exact trouvé, filtrer la liste par le code
      setSearch(query);
    }
  };

  // Capture les scans de douchette même si le focus n'est pas dans le champ de recherche
  // (ex: le caissier vient de cliquer sur un produit ou un bouton). Désactivé pendant qu'une
  // modale est ouverte pour ne pas interférer avec sa propre gestion de la touche Entrée.
  useGlobalBarcodeScanner({
    enabled:
      !selectedVariableProduct &&
      !isCheckoutOpen &&
      !isPanierModalOpen &&
      !showPanierList &&
      !isScannerOpen &&
      !completedSale,
    onScan: handleBarcodeScan,
  });

  // Update cart item quantity
  const updateQuantity = (produitId: number, delta: number, variantId?: string) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.produit.id === produitId && item.variant_id === variantId) {
            const newQty = item.quantite + delta;
            
            // Calcul du stock max disponible
            let maxStock = item.produit.stock;
            if (item.variant_id && item.produit.variantes_detaillees) {
              const v = item.produit.variantes_detaillees.find((vr) => vr.id === item.variant_id);
              if (v) maxStock = v.stock;
            }

            if (newQty > maxStock) return item;
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
  const numericMontantPaye = parseAmount(montantPayeInput);
  const resteAPayer = Math.max(0, totalApresRemise - numericMontantPaye);
  const meRendre = Math.max(0, numericMontantPaye - totalApresRemise);

  // Validate Sale Execution
  const handleConfirmSale = async () => {
    if (cart.length === 0) return;

    if (resteAPayer > 0 && !selectedClientId) {
      await alert('Veuillez sélectionner un client pour enregistrer le reste à payer en dette !');
      return;
    }

    const selectedClient = clients.find((c) => c.id === selectedClientId);

    let statut: 'paye' | 'partiel' | 'credit' = 'paye';
    if (resteAPayer > 0) {
      statut = numericMontantPaye === 0 ? 'credit' : 'partiel';
    }

    // Le serveur fait tout atomiquement (vérification de stock, vente, lignes, décrément du
    // stock, dette client) dans une seule transaction Postgres — voir server/src/routes/ventes.js.
    let newVente: Vente;
    try {
      const result = await apiPost<{ vente: Vente }>('/ventes', {
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
        lignes: cart.map((item) => ({
          produit_id: item.produit.id,
          variant_id: item.variant_id ?? null,
          produit_nom: item.produit.nom,
          variante: item.variante ?? null,
          quantite: item.quantite,
          prix_unitaire: item.prix_unitaire ?? item.produit.prix,
          cout_unitaire: item.produit.cout_achat_unitaire ?? null,
        })),
      });
      newVente = result.vente;
      await reload(); // stock et dette client ont changé côté serveur
    } catch (err) {
      await alert({
        title: 'Vente non enregistrée',
        message: err instanceof ApiError ? err.message : "La vente a échoué : aucune donnée n'a été enregistrée.",
      });
      return;
    }

    // Confettis + reçu
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
    });

    const completedPayload = {
      vente: newVente,
      items: [...cart],
      clientTelephone: selectedClient?.telephone,
      clientNom: selectedClient?.nom,
    };

    setCompletedSale(completedPayload);
    setCompletedPhoneInput(selectedClient?.telephone || '');
    setIsCheckoutOpen(false);

    // Auto-open WhatsApp si activé dans les paramètres et si le client a un numéro
    if (settings?.whatsapp_enabled && settings?.whatsapp_auto_open && selectedClient?.telephone) {
      setTimeout(() => {
        openWhatsAppReceipt({
          vente: newVente,
          lignes: cart.map((item) => ({
            nom: item.produit.nom,
            variante: item.variante,
            quantite: item.quantite,
            prix_unitaire: item.prix_unitaire ?? item.produit.prix,
          })),
          clientTelephone: selectedClient.telephone,
          clientNom: selectedClient.nom,
          settings,
          downloadPdf: true,
        });
      }, 500);
    }

    setCart([]);
  };

  if (loading) {
    return <div className="p-8 text-center text-sm text-slate-400">Chargement…</div>;
  }

  return (
    <div className="h-[calc(100vh-4rem)] min-h-0 flex flex-col lg:flex-row gap-4 lg:gap-6">
      {/* LEFT COLUMN: Product Catalog */}
      <div className="flex-1 flex flex-col min-w-0 space-y-4">
        {/* Search & Category Filter Header */}
        <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between min-w-0">
          {/* Search bar with dynamic expanding width */}
          <div
            className={`relative transition-all duration-300 ease-out shrink-0 ${
              isSearchFocused || search
                ? 'w-full sm:w-[320px] md:w-[380px] lg:w-[420px]'
                : 'w-full sm:w-60 md:w-72'
            }`}
          >
            <Search
              className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors ${
                isSearchFocused ? 'text-blue-500' : 'text-slate-400'
              }`}
            />
            <input
              type="text"
              placeholder="Rechercher par nom ou code-barres..."
              value={search}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const query = search.trim();
                if (!query) return;
                // Une douchette code-barres tape le code puis « Entrée »
                const exact = filteredProducts.find((p) => p.code_barres === query);
                const target = exact ?? (filteredProducts.length === 1 ? filteredProducts[0] : null);
                if (target) {
                  handleProductClick(target);
                  setSearch('');
                }
              }}
              aria-label="Rechercher un produit ou scanner un code-barres"
              className="w-full glass-input pl-10 pr-16 py-2.5 rounded-2xl text-sm text-slate-900 dark:text-white transition-all shadow-xs"
            />
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-full transition-colors"
                  title="Effacer la recherche"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsScannerOpen(true)}
                className="p-1.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 active:scale-95 transition-all"
                title="Scanner un code-barres avec la caméra"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Category Badges with Micro-Scrollbar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 pt-0.5 micro-scrollbar flex-1 min-w-0">
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
        <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3.5 auto-rows-max content-start">
          {filteredProducts.map((produit) => {
            const inCart = cart
              .filter((i) => i.produit.id === produit.id)
              .reduce((sum, item) => sum + item.quantite, 0);

            return (
              <ProductCard
                key={produit.id}
                produit={produit}
                inCartCount={inCart}
                onAddToCart={handleProductCardAddToCart}
                onOpenVariableModal={handleOpenVariableModal}
              />
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
          <div className="flex items-center gap-3">
            {paniersEnAttente.length > 0 && (
              <button
                onClick={() => setShowPanierList(true)}
                className="text-xs text-blue-500 hover:text-blue-600 font-semibold flex items-center gap-1 relative"
              >
                <ArchiveRestore className="w-4 h-4" /> En attente
                <span className="absolute -top-1.5 -right-2 bg-blue-600 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                  {paniersEnAttente.length}
                </span>
              </button>
            )}
            {cart.length > 0 && (
              <>
                <button
                  onClick={() => setIsPanierModalOpen(true)}
                  className="text-xs text-amber-500 hover:text-amber-600 font-semibold flex items-center gap-1"
                  title="Mettre en attente"
                >
                  <Clock className="w-4 h-4" /> Pause
                </button>
                <button
                  onClick={async () => {
                    if (await confirm({ message: 'Vider le panier ?', danger: true, confirmLabel: 'Vider' })) setCart([]);
                  }}
                  className="text-xs text-rose-500 hover:text-rose-600 font-semibold flex items-center gap-1"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
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
                  key={`${item.produit.id}-${item.variant_id || item.variante || 'default'}`}
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
                      {item.variante ? `${item.variante} · ` : ''}
                      {formatCfa(item.prix_unitaire ?? item.produit.prix)} × {item.quantite}
                    </span>
                  </div>

                  {/* Quantity Controls */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => item.produit.id && updateQuantity(item.produit.id, -1, item.variant_id)}
                      className="p-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-6 text-center text-xs font-bold">
                      {item.quantite}
                    </span>
                    <button
                      onClick={() => item.produit.id && updateQuantity(item.produit.id, 1, item.variant_id)}
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

      {/* VARIABLE PRODUCT SELECTION MODAL */}
      <Modal
        isOpen={!!selectedVariableProduct}
        onClose={() => setSelectedVariableProduct(null)}
        title={selectedVariableProduct ? `Choisir l'option — ${selectedVariableProduct.nom}` : ''}
      >
        {selectedVariableProduct && modalResolvedVariant && (
          <div className="space-y-5">
            {/* Header info */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-100/70 dark:bg-slate-850 border border-slate-200/60 dark:border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-white">
                    {selectedVariableProduct.nom}
                  </h4>
                  <span className="text-xs text-slate-400">
                    {selectedVariableProduct.categorie}
                  </span>
                </div>
              </div>
              <Badge variant="purple" size="sm">
                Produit Variable
              </Badge>
            </div>

            {/* Interactive Attribute Selectors */}
            {selectedVariableProduct.attributs && selectedVariableProduct.attributs.length > 0 ? (
              <div className="space-y-4">
                {selectedVariableProduct.attributs.map((attr) => (
                  <div key={attr.nom} className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                      <span>{attr.nom}</span>
                      <span className="text-xs font-extrabold text-blue-600 dark:text-blue-400">
                        {modalAttributes[attr.nom] || 'Non sélectionné'}
                      </span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {attr.valeurs.map((val) => {
                        const isSelected = modalAttributes[attr.nom] === val;
                        return (
                          <button
                            key={val}
                            type="button"
                            onClick={() =>
                              setModalAttributes((prev) => ({
                                ...prev,
                                [attr.nom]: val,
                              }))
                            }
                            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                              isSelected
                                ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/25 scale-[1.02]'
                                : 'glass-card text-slate-700 dark:text-slate-300 hover:border-blue-300 dark:hover:border-white/20'
                            }`}
                          >
                            {val}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Resolved Variant Price & Stock Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 flex items-center justify-between">
              <div>
                <span className="text-[11px] uppercase tracking-wider font-extrabold text-slate-400">
                  Variante Sélectionnée
                </span>
                <div className="text-sm font-black text-slate-900 dark:text-white mt-0.5">
                  {modalVariantLabel || modalResolvedVariant.id}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {modalResolvedVariant.stock > 0 ? (
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> En stock ({modalResolvedVariant.stock} dispos)
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> Épuisé pour cette combinaison
                    </span>
                  )}
                </div>
              </div>

              <div className="text-right">
                <span className="text-[11px] uppercase tracking-wider font-extrabold text-slate-400">
                  Prix Unitaire
                </span>
                <div className="text-2xl font-black text-blue-600 dark:text-blue-400">
                  {formatCfa(modalResolvedVariant.prix)}
                </div>
              </div>
            </div>

            {/* Quantity Selector & Action */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">Quantité :</span>
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/60 dark:border-white/10">
                  <button
                    type="button"
                    disabled={modalQuantity <= 1}
                    onClick={() => setModalQuantity((q) => Math.max(1, q - 1))}
                    className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-8 text-center text-xs font-black text-slate-900 dark:text-white">
                    {modalQuantity}
                  </span>
                  <button
                    type="button"
                    disabled={modalQuantity >= modalResolvedVariant.stock}
                    onClick={() => setModalQuantity((q) => Math.min(modalResolvedVariant.stock, q + 1))}
                    className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => setSelectedVariableProduct(null)}>
                  Annuler
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleAddModalVariantToCart}
                  disabled={modalResolvedVariant.stock <= 0}
                  className="font-bold shadow-lg shadow-blue-500/25"
                >
                  <ShoppingBag className="w-4 h-4 mr-1.5" />
                  Ajouter au Panier ({formatCfa(modalResolvedVariant.prix * modalQuantity)})
                </Button>
              </div>
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
                type="button"
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
                type="button"
                onClick={() => setPaymentMethod('mobile_money')}
                className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                  paymentMethod === 'mobile_money'
                    ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                    : 'glass-card text-slate-600 dark:text-slate-400'
                }`}
              >
                <Smartphone className="w-5 h-5" /> Mobile money
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('virement')}
                className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                  paymentMethod === 'virement'
                    ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                    : 'glass-card text-slate-600 dark:text-slate-400'
                }`}
              >
                <Landmark className="w-5 h-5" /> Virement
              </button>
            </div>
          </div>

          {/* Discount, amount paid and balance */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
                Remise (F)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={remiseInput}
                onChange={(e) => setRemiseInput(e.target.value)}
                className="w-full glass-input px-4 py-3 rounded-2xl text-lg font-bold text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
                Montant Versé par le Client (F)
              </label>
              <input
                type="text"
                inputMode="decimal"
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
          {/* Reçu imprimable (masqué à l'écran, visible seulement à l'impression) */}
          <ReceiptPrint
            format={printFormat}
            settings={settings}
            data={{
              ref: completedSale.vente.id,
              date: completedSale.vente.date,
              client_nom: completedSale.vente.client_nom,
              vendeur_nom: completedSale.vente.vendeur_nom,
              vendeur_identifiant: completedSale.vente.vendeur_identifiant,
              methode_paiement: completedSale.vente.methode_paiement,
              remise: completedSale.vente.remise,
              total: completedSale.vente.total,
              montant_paye: completedSale.vente.montant_paye,
              reste_a_payer: completedSale.vente.reste_a_payer,
              lignes: completedSale.items.map((item) => ({
                nom: item.produit.nom,
                variante: item.variante,
                quantite: item.quantite,
                prix_unitaire: item.prix_unitaire ?? item.produit.prix,
              })),
            } satisfies ReceiptData}
          />
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
                    {formatCfa((item.prix_unitaire ?? item.produit.prix) * item.quantite)}
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

            <div className="flex flex-col sm:flex-row items-center justify-between pt-4 gap-3">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <select
                  value={printFormat}
                  onChange={(e) => setPrintFormat(e.target.value as 'a4' | 'thermique')}
                  className="glass-input px-3 py-2 rounded-xl text-xs text-slate-900 dark:text-white"
                >
                  <option value="thermique">Thermique (80mm)</option>
                  <option value="a4">Facture A4</option>
                </select>
                <Button
                  variant="glass"
                  icon={<Printer className="w-4 h-4" />}
                  onClick={() => window.print()}
                >
                  Imprimer
                </Button>
              </div>
              <Button variant="primary" className="w-full sm:w-auto" onClick={() => setCompletedSale(null)}>
                Terminer
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {/* MODAL: Mettre le panier en attente */}
      <Modal isOpen={isPanierModalOpen} onClose={() => setIsPanierModalOpen(false)} title="Mettre le panier en attente">
        <form onSubmit={handleMettreEnAttente} className="space-y-4">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block">
            Référence du panier (Ex: Nom du client)
          </label>
          <input
            autoFocus
            required
            value={panierReference}
            onChange={(e) => setPanierReference(e.target.value)}
            className="w-full glass-input px-4 py-3 rounded-xl text-slate-900 dark:text-white"
            placeholder="Client t-shirt rouge..."
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setIsPanierModalOpen(false)}>Annuler</Button>
            <Button type="submit" variant="primary">Enregistrer en attente</Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Liste des paniers en attente */}
      <Modal isOpen={showPanierList} onClose={() => setShowPanierList(false)} title="Paniers en attente">
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {paniersEnAttente.length === 0 ? (
            <p className="text-slate-500 text-sm italic text-center py-4">Aucun panier en attente.</p>
          ) : (
            paniersEnAttente.map((panier) => (
              <div key={panier.id} className="glass-card p-4 rounded-xl flex items-center justify-between border border-slate-200/50 dark:border-white/10">
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white">{panier.nom_reference}</h4>
                  <p className="text-xs text-slate-400">
                    {new Date(panier.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} • {formatCfa(panier.total)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => panier.id && handleDeletePanier(panier.id)}
                    className="p-2 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition-all"
                    title="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <Button variant="primary" size="sm" onClick={() => panier.id && handleRestaurerPanier(panier.id)}>
                    Reprendre
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>

      {/* MODAL: Scanner de Code-barres Caméra */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleBarcodeScan}
        continuous
        title="Scanner Caisse (Caméra)"
      />

      {/* MODAL: Vente Enregistrée, Reçu & WhatsApp */}
      {completedSale && (
        <Modal
          isOpen={Boolean(completedSale)}
          onClose={() => setCompletedSale(null)}
          title="Vente enregistrée avec succès 🎉"
        >
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto mb-2 shadow-lg shadow-emerald-500/30">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="font-extrabold text-lg text-slate-900 dark:text-white">
                Paiement Validé : {formatCfa(completedSale.vente.total)}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Réf : <span className="font-mono font-bold text-slate-700 dark:text-slate-300">#{completedSale.vente.id.substring(0, 8).toUpperCase()}</span>
                {completedSale.clientNom && ` • Client : ${completedSale.clientNom}`}
              </p>
            </div>

            {/* Actions WhatsApp & Facture PDF */}
            <div className="space-y-3 pt-1">
              <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-blue-500/10 border border-emerald-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-sm text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4 text-emerald-500" />
                    WhatsApp Reçu & Remerciement
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                    PDF A4 Inclus
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Smartphone className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type="tel"
                      value={completedPhoneInput}
                      onChange={(e) => setCompletedPhoneInput(e.target.value)}
                      placeholder="Numéro WhatsApp du client (ex: 97000000)"
                      className="w-full glass-input pl-9 pr-3 py-2 rounded-xl text-xs font-mono font-bold"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/25 shrink-0"
                    icon={<Send className="w-3.5 h-3.5" />}
                    disabled={!completedPhoneInput.trim()}
                    onClick={() => {
                      openWhatsAppReceipt({
                        vente: completedSale.vente,
                        lignes: completedSale.items.map((item) => ({
                          nom: item.produit.nom,
                          variante: item.variante,
                          quantite: item.quantite,
                          prix_unitaire: item.prix_unitaire ?? item.produit.prix,
                        })),
                        clientTelephone: completedPhoneInput.trim(),
                        clientNom: completedSale.clientNom,
                        settings,
                        downloadPdf: true,
                      });
                    }}
                  >
                    Envoyer WhatsApp & PDF
                  </Button>
                </div>
                <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80">
                  ⚡ Télécharge instantanément la <strong>Facture officielle A4 (PDF)</strong> et pré-remplit le message WhatsApp avec le nom du client et la liste complète des articles.
                </p>
              </div>

              {/* Téléchargement direct PDF A4 */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-white/10">
                <div className="text-xs">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5 text-blue-500" />
                    Télécharger la Facture A4 (PDF)
                  </div>
                  <div className="text-slate-400 text-[11px]">Format pleine page officiel avec tableau et totaux</div>
                </div>
                <Button
                  type="button"
                  variant="glass"
                  size="sm"
                  icon={<Download className="w-3.5 h-3.5 text-blue-500" />}
                  onClick={() => {
                    generateInvoiceA4Pdf({
                      vente: completedSale.vente,
                      lignes: completedSale.items.map((item) => ({
                        nom: item.produit.nom,
                        variante: item.variante,
                        quantite: item.quantite,
                        prix_unitaire: item.prix_unitaire ?? item.produit.prix,
                      })),
                      clientNom: completedSale.clientNom,
                      clientTelephone: completedPhoneInput || completedSale.clientTelephone,
                      settings,
                      autoDownload: true,
                    });
                  }}
                >
                  Télécharger PDF
                </Button>
              </div>

              {/* Format selection */}
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">
                  Format d'impression physique
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPrintFormat('thermique')}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${
                      printFormat === 'thermique'
                        ? 'border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-400'
                        : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Rouleau 80mm / 58mm
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintFormat('a4')}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${
                      printFormat === 'a4'
                        ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Facture A4
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200/60 dark:border-white/10">
              <Button variant="ghost" onClick={() => setCompletedSale(null)}>
                Nouvelle Vente
              </Button>
              <Button
                variant="primary"
                icon={<Printer className="w-4 h-4" />}
                onClick={() => window.print()}
              >
                Imprimer Ticket
              </Button>
            </div>

            {completedSale && (
              <ReceiptPrint
                data={{
                  ref: completedSale.vente.id,
                  date: completedSale.vente.date,
                  client_nom: completedSale.vente.client_nom,
                  vendeur_nom: completedSale.vente.vendeur_nom,
                  methode_paiement: completedSale.vente.methode_paiement,
                  lignes: completedSale.items.map((item) => ({
                    nom: item.produit.nom,
                    variante: item.variante,
                    quantite: item.quantite,
                    prix_unitaire: item.prix_unitaire ?? item.produit.prix,
                  })),
                  remise: completedSale.vente.remise,
                  total: completedSale.vente.total,
                  montant_paye: completedSale.vente.montant_paye,
                  reste_a_payer: completedSale.vente.reste_a_payer,
                }}
                format={printFormat}
                settings={settings}
              />
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
