import React, { useState, useEffect } from 'react';
import type {
  Produit,
  VarianteProduit,
  Fournisseur,
  Zone,
} from '../../db/db';
import { apiPost, ApiError } from '../../services/api';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { useDialog } from '../../components/ui/DialogProvider';
import { formatCfa } from '../../utils/currency';


export interface StockModalRequest {
  produit?: Produit;
  variantId?: string;
}

interface RestockModalProps {
  /** null = fermée ; sinon la modale s'ouvre, pré-remplie pour ce produit (ou le premier). */
  request: StockModalRequest | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  produits: Produit[];
  fournisseurs: Fournisseur[];
  zones: Zone[];
  activeZoneId: number | null;
}

/** Modale « Nouveau réapprovisionnement » : quantité, coûts synchronisés, prix de vente et marge. */
export const RestockModal: React.FC<RestockModalProps> = ({
  request,
  onClose,
  onSaved,
  produits,
  fournisseurs,
  zones,
  activeZoneId,
}) => {
  const { alert } = useDialog();
  const [selectedFournisseurId, setSelectedFournisseurId] = useState<number | ''>('');
  const [selectedProduitId, setSelectedProduitId] = useState<number | ''>('');
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [achatQuantite, setAchatQuantite] = useState('10');
  const [achatCoutUnitaire, setAchatCoutUnitaire] = useState('');
  const [achatCoutTotal, setAchatCoutTotal] = useState('');
  const [nouveauPrixVente, setNouveauPrixVente] = useState('');
  const [achatZoneId, setAchatZoneId] = useState<number | ''>('');

  // Pré-remplissage à chaque ouverture.
  useEffect(() => {
    if (!request) return;
    const p = request.produit;
    const variantId = request.variantId;
      const prod = p ?? (produits.length > 0 ? produits[0] : null);
      if (prod && prod.id) {
        setSelectedProduitId(prod.id);
        setSelectedFournisseurId(prod.fournisseur_id ?? (fournisseurs.length > 0 ? fournisseurs[0].id ?? '' : ''));
        setAchatZoneId(prod.zone_id ?? activeZoneId ?? (zones.length > 0 ? zones[0].id ?? '' : ''));
        setAchatQuantite('10');

        let curVar: VarianteProduit | undefined = undefined;
        if (prod.is_variable && prod.variantes_detaillees && prod.variantes_detaillees.length > 0) {
          const vId = variantId ?? prod.variantes_detaillees[0].id;
          setSelectedVariantId(vId);
          curVar = prod.variantes_detaillees.find((vr) => vr.id === vId);
        } else {
          setSelectedVariantId('');
        }

        const salePrice = curVar ? curVar.prix : prod.prix;
        const unitCost = (curVar ? curVar.cout_achat_unitaire : prod.cout_achat_unitaire) ?? Math.round(salePrice * 0.7);
        setAchatCoutUnitaire(unitCost.toString());
        setAchatCoutTotal((unitCost * 10).toString());
        setNouveauPrixVente(salePrice.toString());
      } else {
        setSelectedProduitId('');
        setSelectedFournisseurId(fournisseurs.length > 0 ? fournisseurs[0].id ?? '' : '');
        setAchatZoneId(activeZoneId ?? (zones.length > 0 ? zones[0].id ?? '' : ''));
        setAchatQuantite('10');
        setAchatCoutUnitaire('');
        setAchatCoutTotal('');
        setNouveauPrixVente('');
        setSelectedVariantId('');
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const handleAchatProductChange = (pid: number | '') => {
    setSelectedProduitId(pid);
    if (!pid) {
      setSelectedVariantId('');
      setNouveauPrixVente('');
      setAchatCoutUnitaire('');
      setAchatCoutTotal('');
      return;
    }
    const pr = produits.find((p) => p.id === pid);
    if (!pr) return;

    if (pr.fournisseur_id) setSelectedFournisseurId(pr.fournisseur_id);
    if (pr.zone_id) setAchatZoneId(pr.zone_id);

    let curVar: VarianteProduit | undefined = undefined;
    if (pr.is_variable && pr.variantes_detaillees && pr.variantes_detaillees.length > 0) {
      curVar = pr.variantes_detaillees[0];
      setSelectedVariantId(curVar.id);
    } else {
      setSelectedVariantId('');
    }

    const salePrice = curVar ? curVar.prix : pr.prix;
    const unitCost = (curVar ? curVar.cout_achat_unitaire : pr.cout_achat_unitaire) ?? Math.round(salePrice * 0.7);
    const qty = parseInt(achatQuantite, 10) || 10;
    setAchatCoutUnitaire(unitCost.toString());
    setAchatCoutTotal((unitCost * qty).toString());
    setNouveauPrixVente(salePrice.toString());
  };

  const handleAchatVariantChange = (vId: string) => {
    setSelectedVariantId(vId);
    const pr = produits.find((p) => p.id === selectedProduitId);
    if (!pr || !pr.variantes_detaillees) return;
    const v = pr.variantes_detaillees.find((vr) => vr.id === vId);
    if (!v) return;

    const salePrice = v.prix;
    const unitCost = v.cout_achat_unitaire ?? Math.round(salePrice * 0.7);
    const qty = parseInt(achatQuantite, 10) || 10;
    setAchatCoutUnitaire(unitCost.toString());
    setAchatCoutTotal((unitCost * qty).toString());
    setNouveauPrixVente(salePrice.toString());
  };

  const handleAchatQtyChange = (qtyStr: string) => {
    setAchatQuantite(qtyStr);
    const qty = parseInt(qtyStr, 10);
    const unit = parseFloat(achatCoutUnitaire);
    if (Number.isFinite(qty) && qty > 0 && Number.isFinite(unit) && unit > 0) {
      setAchatCoutTotal((qty * unit).toString());
    }
  };

  const handleAchatUnitCostChange = (unitStr: string) => {
    setAchatCoutUnitaire(unitStr);
    const unit = parseFloat(unitStr);
    const qty = parseInt(achatQuantite, 10);
    if (Number.isFinite(unit) && unit >= 0 && Number.isFinite(qty) && qty > 0) {
      setAchatCoutTotal((unit * qty).toString());
    }
  };

  const handleAchatTotalCostChange = (totStr: string) => {
    setAchatCoutTotal(totStr);
    const tot = parseFloat(totStr);
    const qty = parseInt(achatQuantite, 10);
    if (Number.isFinite(tot) && tot >= 0 && Number.isFinite(qty) && qty > 0) {
      setAchatCoutUnitaire((tot / qty).toFixed(2));
    }
  };

  const handleSaveAchat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFournisseurId || !selectedProduitId || !achatQuantite || !achatCoutTotal || !achatZoneId) return;

    const fId = Number(selectedFournisseurId);
    const pId = Number(selectedProduitId);
    const qty = parseInt(achatQuantite, 10);
    const cout = parseFloat(achatCoutTotal);

    const targetFournisseur = fournisseurs.find((f) => f.id === fId);
    const targetProduit = produits.find((p) => p.id === pId);

    if (targetProduit && targetProduit.id && Number.isFinite(qty) && qty > 0 && Number.isFinite(cout)) {
      const coutUnitaire = cout / qty;

      let variantLabel: string | undefined = undefined;
      if (targetProduit.is_variable && targetProduit.variantes_detaillees && selectedVariantId) {
        const v = targetProduit.variantes_detaillees.find((vr) => vr.id === selectedVariantId);
        if (v) {
          variantLabel = Object.entries(v.attributs).map(([k, val]) => `${k}: ${val}`).join(' · ');
        }
      }

      const newSalePriceNum = parseFloat(nouveauPrixVente);
      const hasNewSalePrice = Number.isFinite(newSalePriceNum) && newSalePriceNum > 0;

      // Le serveur fait tout atomiquement : incrémente le stock, met à jour le coût d'achat
      // (et le prix de vente si fourni), et journalise l'achat (voir server/src/routes/achatsStock.js).
      try {
        await apiPost('/achats-stock', {
          fournisseur_id: fId,
          fournisseur_nom: targetFournisseur ? targetFournisseur.nom : 'Fournisseur',
          produit_id: pId,
          produit_nom: targetProduit.nom,
          variant_id: selectedVariantId || undefined,
          variante: variantLabel,
          quantite: qty,
          cout_total: cout,
          cout_unitaire: coutUnitaire,
          zone_id: Number(achatZoneId),
          nouveau_prix_vente: hasNewSalePrice ? newSalePriceNum : undefined,
        });
        await onSaved();
      } catch (err) {
        await alert(err instanceof ApiError ? err.message : "Échec de l'enregistrement de l'achat.");
        return;
      }
    }

    onClose();
  };

  return (
    <Modal
      isOpen={request !== null}
      onClose={onClose}
      title="Nouveau Réapprovisionnement Stock"
      maxWidth="2xl"
    >
      <form onSubmit={handleSaveAchat} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              Zone / Magasin
            </label>
            <select
              required
              value={achatZoneId}
              onChange={(e) => setAchatZoneId(e.target.value ? Number(e.target.value) : '')}
              className="w-full glass-input px-3 py-2.5 rounded-xl text-sm text-slate-900 dark:text-white"
            >
              <option value="">-- Sélectionner une zone --</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.nom} ({zone.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
            Produit à réapprovisionner
          </label>
          <select
            required
            value={selectedProduitId}
            onChange={(e) => handleAchatProductChange(e.target.value ? Number(e.target.value) : '')}
            className="w-full glass-input px-3 py-2.5 rounded-xl text-sm text-slate-900 dark:text-white"
          >
            <option value="">-- Sélectionner un produit --</option>
            {produits.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom} ({p.is_variable ? `${p.variantes_detaillees?.length ?? 0} variantes - Stock total: ${p.stock}` : `Stock actuel: ${p.stock} | Prix vente: ${formatCfa(p.prix)}`})
              </option>
            ))}
          </select>
        </div>

        {/* Si le produit sélectionné est variable, afficher le choix de la variante */}
        {(() => {
          const pr = produits.find((p) => p.id === selectedProduitId);
          if (!pr || !pr.is_variable || !pr.variantes_detaillees || pr.variantes_detaillees.length === 0) {
            return null;
          }
          return (
            <div className="p-3 rounded-xl bg-slate-500/10 border border-slate-500/20 space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                Variante spécifique à réapprovisionner
              </label>
              <select
                required
                value={selectedVariantId}
                onChange={(e) => handleAchatVariantChange(e.target.value)}
                className="w-full glass-input px-3 py-2 rounded-lg text-xs font-semibold text-slate-900 dark:text-white"
              >
                {pr.variantes_detaillees.map((v) => {
                  const label = Object.entries(v.attributs).map(([k, val]) => `${k}: ${val}`).join(' · ');
                  return (
                    <option key={v.id} value={v.id}>
                      {label} (Stock actuel: {v.stock} | Prix vente: {formatCfa(v.prix)})
                    </option>
                  );
                })}
              </select>
            </div>
          );
        })()}

        {/* Quantité & Coûts synchronisés */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
              Quantité reçue
            </label>
            <input
              type="number"
              min="1"
              required
              value={achatQuantite}
              onChange={(e) => handleAchatQtyChange(e.target.value)}
              className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
              Coût d'Achat Unitaire (F)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={achatCoutUnitaire}
              onChange={(e) => handleAchatUnitCostChange(e.target.value)}
              placeholder="Ex: 15000"
              className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
              Coût Total d'Achat (F)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={achatCoutTotal}
              onChange={(e) => handleAchatTotalCostChange(e.target.value)}
              placeholder="Ex: 150000"
              className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-900 dark:text-white"
            />
          </div>
        </div>

        {/* Section Mise à Jour du Prix de Vente Client & Marge */}
        {(() => {
          const pr = produits.find((p) => p.id === selectedProduitId);
          let currentSalePrice = 0;
          if (pr) {
            if (pr.is_variable && pr.variantes_detaillees && selectedVariantId) {
              const v = pr.variantes_detaillees.find((vr) => vr.id === selectedVariantId);
              currentSalePrice = v ? v.prix : pr.prix;
            } else {
              currentSalePrice = pr.prix;
            }
          }

          const unitCostNum = parseFloat(achatCoutUnitaire) || 0;
          const newSalePriceNum = parseFloat(nouveauPrixVente) || 0;
          const marginAmount = newSalePriceNum - unitCostNum;
          const marginPercent = unitCostNum > 0 ? Math.round((marginAmount / unitCostNum) * 100) : 0;
          const isLoss = newSalePriceNum > 0 && unitCostNum > 0 && newSalePriceNum < unitCostNum;

          return (
            <div className="p-4 rounded-xl bg-surface-muted border border-line space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200/50 dark:border-white/10">
                <div>
                  <span className="text-xs uppercase tracking-wide font-semibold text-slate-500 block">
                    Ajustement du Prix de Vente Client
                  </span>
                  <span className="text-xs font-medium text-slate-500">
                    Prix de vente actuel en caisse : <strong className="text-slate-900 dark:text-white">{formatCfa(currentSalePrice)}</strong>
                  </span>
                </div>
                {unitCostNum > 0 && newSalePriceNum > 0 && (
                  <Badge variant={isLoss ? 'red' : marginPercent > 20 ? 'green' : 'amber'} size="sm">
                    {isLoss ? 'Vente à perte' : `Marge estimée : +${formatCfa(marginAmount)} (+${marginPercent}%)`}
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                    Nouveau Prix de Vente Client (F)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={nouveauPrixVente}
                    onChange={(e) => setNouveauPrixVente(e.target.value)}
                    placeholder={currentSalePrice.toString()}
                    className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-semibold text-blue-600 dark:text-blue-400"
                  />
                </div>
                <div className="text-xs text-slate-500 space-y-1">
                  <p>Si le fournisseur a augmenté ou baissé ses tarifs, ajustez ce montant pour actualiser instantanément le prix de vente en caisse.</p>
                </div>
              </div>
            </div>
          );
        })()}

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-200/50 dark:border-white/10">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" type="submit">
            Valider le Réapprovisionnement
          </Button>
        </div>
      </form>
    </Modal>
  );
};
