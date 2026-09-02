import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Package, ShoppingBag, Layers } from 'lucide-react';
import { Produit, VarianteProduit } from '../db/db';
import { formatCfa } from '../utils/currency';

export type AddToCartPayload =
  | {
      type: 'simple';
      productId: number;
      produit: Produit;
      prix: number;
      quantite?: number;
    }
  | {
      type: 'variable';
      productId: number;
      variantId: string;
      produit: Produit;
      variante: VarianteProduit;
      varianteLabel: string;
      prix: number;
      quantite?: number;
    };

interface ProductCardProps {
  produit: Produit;
  inCartCount?: number;
  onAddToCart: (payload: AddToCartPayload) => void;
  onOpenVariableModal?: (produit: Produit) => void;
  compact?: boolean;
  showImage?: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  produit,
  inCartCount = 0,
  onAddToCart,
  onOpenVariableModal,
  compact = false,
  showImage = false,
}) => {
  // Détecter si le produit est variable
  const isVariable = Boolean(produit.is_variable && produit.variantes_detaillees && produit.variantes_detaillees.length > 0);

  // État des attributs sélectionnés
  const [selectedAttributes, setSelectedAttributes] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isVariable && produit.attributs && produit.attributs.length > 0) {
      const defaults: Record<string, string> = {};
      produit.attributs.forEach((attr) => {
        if (attr.valeurs && attr.valeurs.length > 0) {
          defaults[attr.nom] = attr.valeurs[0];
        }
      });
      setSelectedAttributes(defaults);
    } else {
      setSelectedAttributes({});
    }
  }, [produit.id, isVariable, produit.attributs]);

  // Résolution de variante par défaut
  const currentVariant = useMemo<VarianteProduit | null>(() => {
    if (!isVariable || !produit.variantes_detaillees || produit.variantes_detaillees.length === 0) return null;

    const matched = produit.variantes_detaillees.find((v) =>
      Object.entries(selectedAttributes).every(
        ([nomAttr, valAttr]) => v.attributs && v.attributs[nomAttr] === valAttr
      )
    );

    return matched || produit.variantes_detaillees[0];
  }, [isVariable, produit.variantes_detaillees, selectedAttributes]);

  const priceRange = useMemo(() => {
    if (!isVariable || !produit.variantes_detaillees || produit.variantes_detaillees.length === 0) return null;
    const prices = produit.variantes_detaillees.map((v) => v.prix).filter((p) => typeof p === 'number');
    if (prices.length === 0) return null;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return { min, max, isRange: min !== max };
  }, [isVariable, produit.variantes_detaillees]);

  const totalStock = useMemo(() => {
    if (!isVariable || !produit.variantes_detaillees) return produit.stock ?? 0;
    return produit.variantes_detaillees.reduce((sum, v) => sum + (v.stock || 0), 0);
  }, [isVariable, produit.variantes_detaillees, produit.stock]);

  const displayPrice = isVariable
    ? (priceRange ? priceRange.min : (produit.prix ?? 0))
    : (produit.prix ?? 0);

  const isOutOfStock = totalStock <= 0;
  const isLowStock = !isOutOfStock && totalStock <= (produit.min_stock ?? 0);

  const variantLabel = useMemo(() => {
    if (!currentVariant || !currentVariant.attributs) return '';
    return Object.entries(currentVariant.attributs)
      .map(([k, v]) => `${k}: ${v}`)
      .join(' · ');
  }, [currentVariant]);

  // Gestion du clic d'ajout / choix
  const handleClick = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isOutOfStock || !produit.id) return;

    if (isVariable) {
      if (onOpenVariableModal) {
        onOpenVariableModal(produit);
      } else if (currentVariant) {
        onAddToCart({
          type: 'variable',
          productId: produit.id,
          variantId: currentVariant.id,
          produit,
          variante: currentVariant,
          varianteLabel: variantLabel || 'Variante',
          prix: Number(currentVariant.prix ?? produit.prix) || 0,
        });
      }
    } else {
      // Produit simple
      onAddToCart({
        type: 'simple',
        productId: produit.id,
        produit,
        prix: Number(produit.prix) || 0,
      });
    }
  };

  return (
    <motion.div
      whileHover={isOutOfStock ? undefined : { scale: 1.015, y: -2 }}
      whileTap={isOutOfStock ? undefined : { scale: 0.985 }}
      onClick={handleClick}
      className={`group glass-card cursor-pointer rounded-2xl p-3.5 flex flex-col justify-between relative overflow-hidden transition-all border ${
        inCartCount > 0
          ? 'ring-2 ring-blue-500 border-blue-400 dark:border-blue-500 bg-blue-500/5'
          : isOutOfStock
          ? 'opacity-60 cursor-not-allowed border-rose-300/50 dark:border-rose-950/50'
          : 'hover:border-blue-400/60 dark:hover:border-white/20 hover:shadow-md'
      }`}
    >
      <div className="space-y-2">
        {/* Header Badges : Type Produit (gauche) & Stock (droite) */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className={`p-1.5 rounded-lg shrink-0 ${isVariable ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'}`}>
              {isVariable ? <Layers className="w-3.5 h-3.5" /> : <Package className="w-3.5 h-3.5" />}
            </div>
            <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md truncate ${
              isVariable
                ? 'bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200/50 dark:border-purple-800/30'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/40 dark:border-white/5'
            }`}>
              {isVariable ? `${produit.variantes_detaillees?.length || 0} Var.` : 'Simple'}
            </span>
          </div>

          {/* Badge Stock sécurisé contre le débordement */}
          {isOutOfStock ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 shrink-0 whitespace-nowrap">
              Épuisé
            </span>
          ) : isLowStock ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0 whitespace-nowrap">
              Reste {totalStock}
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border border-slate-200/50 dark:border-white/10 shrink-0 whitespace-nowrap">
              {totalStock} en stock
            </span>
          )}
        </div>

        {/* Optional Image */}
        {showImage && produit.image_url && (
          <div className="w-full h-28 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <img src={produit.image_url} alt={produit.nom} className="h-full w-full object-contain p-2" />
          </div>
        )}

        {/* Product Name & Category */}
        <div className="space-y-0.5">
          <h4
            className="font-bold text-sm text-slate-900 dark:text-white line-clamp-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"
            title={produit.nom}
          >
            {produit.nom}
          </h4>
          <p className="text-[11px] text-slate-400 font-medium truncate">{produit.categorie}</p>
        </div>

        {/* Variantes : ligne compacte élégante (évite les cartes géantes) */}
        {isVariable && produit.attributs && produit.attributs.length > 0 && (
          <div className="flex items-center gap-1 text-[11px] text-purple-700 dark:text-purple-300 bg-purple-500/10 px-2 py-1 rounded-lg border border-purple-500/15 truncate">
            <Layers className="w-3 h-3 shrink-0" />
            <span className="truncate font-medium">
              {produit.attributs.map((attr) => attr.nom).join(' · ')}
            </span>
          </div>
        )}
      </div>

      {/* Footer: Price & Add / Choose Button */}
      <div className="mt-3 pt-2.5 border-t border-slate-200/50 dark:border-white/10 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm sm:text-base font-black text-blue-600 dark:text-blue-400 truncate">
            {isVariable && priceRange?.isRange ? `Dès ${formatCfa(priceRange.min)}` : formatCfa(displayPrice)}
          </div>
          {isVariable && priceRange?.isRange && (
            <div className="text-[10px] font-semibold text-slate-400 truncate">
              Jusqu'à {formatCfa(priceRange.max)}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleClick}
          disabled={isOutOfStock}
          title={isOutOfStock ? 'Produit épuisé' : isVariable ? 'Choisir une variante' : 'Ajouter au panier'}
          className={`relative flex items-center justify-center p-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            isOutOfStock
              ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
              : isVariable
              ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-sm shadow-purple-500/25 active:scale-95'
              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-500/25 active:scale-95'
          }`}
        >
          {isVariable ? <Layers className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
          {inCartCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center shadow">
              {inCartCount}
            </span>
          )}
        </button>
      </div>
    </motion.div>
  );
};
