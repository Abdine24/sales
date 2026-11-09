import React, { useState, useMemo, useEffect } from 'react';
import { ShoppingBag, Layers } from 'lucide-react';
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
  saisiePrixALaVente?: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  produit,
  inCartCount = 0,
  onAddToCart,
  onOpenVariableModal,
  compact = false,
  showImage = false,
  saisiePrixALaVente = false,
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
    // Carte plane : pas de soulèvement au survol (la grille de caisse ne bouge pas sous la
    // souris). Survol = bordure accent (souris uniquement), appui = léger tassement CSS.
    // Le clavier passe par le bouton « Ajouter » du pied de carte.
    <div
      onClick={handleClick}
      className={`group glass-card rounded-xl p-3 flex flex-col justify-between relative overflow-hidden transition-[border-color,transform] duration-150 ${
        inCartCount > 0
          ? 'ring-2 ring-accent !border-accent cursor-pointer active:scale-[0.98]'
          : isOutOfStock
          ? 'opacity-60 cursor-not-allowed'
          : 'cursor-pointer hover:!border-accent active:scale-[0.98]'
      }`}
    >
      <div className="space-y-2">
        {/* En-tête : état du stock (gauche) et nombre de variantes (droite), en texte sobre. */}
        <div className="flex items-center justify-between gap-2 text-xs">
          {isOutOfStock ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-rose-700 dark:text-rose-400">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Épuisé
            </span>
          ) : isLowStock ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Reste {totalStock}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-ink-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {totalStock} en stock
            </span>
          )}
          {isVariable && (
            <span className="inline-flex items-center gap-1 text-ink-muted shrink-0">
              <Layers className="w-3.5 h-3.5" />
              {produit.variantes_detaillees?.length || 0} var.
            </span>
          )}
        </div>

        {/* Optional Image */}
        {showImage && produit.image_url && (
          <div className="w-full h-28 rounded-lg overflow-hidden bg-surface-muted flex items-center justify-center">
            <img src={produit.image_url} alt={produit.nom} className="h-full w-full object-contain p-2" />
          </div>
        )}

        {/* Product Name & Category */}
        <div className="space-y-0.5">
          <h4
            className="font-medium text-sm text-ink leading-snug line-clamp-2 break-words"
            title={produit.nom}
          >
            {produit.nom}
          </h4>
          <p className="text-xs text-ink-muted truncate">{produit.categorie}</p>
        </div>

        {/* Variantes : ligne compacte élégante (évite les cartes géantes) */}
        {isVariable && produit.attributs && produit.attributs.length > 0 && (
          <div className="text-xs text-ink-muted truncate">
            <span className="truncate">
              {produit.attributs.map((attr) => attr.nom).join(' · ')}
            </span>
          </div>
        )}
      </div>

      {/* Footer: Price & Add / Choose Button */}
      <div className="mt-3 pt-2.5 border-t border-line flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink break-words leading-tight">
            {isVariable && priceRange?.isRange && priceRange.min > 0
              ? `Dès ${formatCfa(priceRange.min)}`
              : (saisiePrixALaVente || displayPrice === 0)
              ? 'Saisie à la vente'
              : formatCfa(displayPrice)}
          </div>
          {isVariable && priceRange?.isRange && priceRange.max > 0 && (
            <div className="text-xs text-ink-muted break-words">
              Jusqu'à {formatCfa(priceRange.max)}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleClick}
          disabled={isOutOfStock}
          title={isOutOfStock ? 'Produit épuisé' : isVariable ? 'Choisir une variante' : 'Ajouter au panier'}
          aria-label={isOutOfStock ? `${produit.nom} : épuisé` : isVariable ? `Choisir une variante de ${produit.nom}` : `Ajouter ${produit.nom} au panier`}
          className={`relative w-10 h-10 flex items-center justify-center rounded-lg transition-colors shrink-0 ${
            isOutOfStock
              ? 'bg-slate-200 dark:bg-slate-800 text-slate-500 cursor-not-allowed'
              : isVariable
              ? 'bg-surface border border-line-strong text-ink hover:bg-slate-100 dark:hover:bg-slate-700'
              : 'bg-accent hover:bg-accent-hover text-white'
          }`}
        >
          {isVariable ? <Layers className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
          {inCartCount > 0 && (
            <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 rounded-full bg-ink text-surface text-xs font-semibold flex items-center justify-center">
              {inCartCount > 99 ? '99+' : inCartCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
};
