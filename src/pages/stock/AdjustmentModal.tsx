import React, { useState, useEffect } from 'react';
import type {
  Produit,
  MotifAjustement,
} from '../../db/db';
import { apiPost, ApiError } from '../../services/api';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { useDialog } from '../../components/ui/DialogProvider';
import type { StockModalRequest } from './RestockModal';

interface AdjustmentModalProps {
  request: StockModalRequest | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  produits: Produit[];
}

/** Modale « Ajustement de stock » : stock constaté, motif audité, commentaire. */
export const AdjustmentModal: React.FC<AdjustmentModalProps> = ({ request, onClose, onSaved, produits }) => {
  const { alert } = useDialog();
  const [ajustementProduitId, setAjustementProduitId] = useState<number | ''>('');
  const [ajustementVariantId, setAjustementVariantId] = useState<string>('');
  const [nouveauStockConstate, setNouveauStockConstate] = useState<string>('');
  const [ajustementMotif, setAjustementMotif] = useState<MotifAjustement>('inventaire');
  const [ajustementCommentaire, setAjustementCommentaire] = useState('');

  // Pré-remplissage à chaque ouverture.
  useEffect(() => {
    if (!request) return;
    const p = request.produit;
    const variantId = request.variantId;
      const prod = p ?? (produits.length > 0 ? produits[0] : null);
      if (prod && prod.id) {
        setAjustementProduitId(prod.id);
        if (prod.is_variable && prod.variantes_detaillees && prod.variantes_detaillees.length > 0) {
          const vId = variantId ?? prod.variantes_detaillees[0].id;
          setAjustementVariantId(vId);
          const v = prod.variantes_detaillees.find((vr) => vr.id === vId);
          setNouveauStockConstate(v ? v.stock.toString() : '0');
        } else {
          setAjustementVariantId('');
          setNouveauStockConstate(prod.stock.toString());
        }
      } else {
        setAjustementProduitId('');
        setAjustementVariantId('');
        setNouveauStockConstate('0');
      }
      setAjustementMotif('inventaire');
      setAjustementCommentaire('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const handleSaveAjustement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ajustementProduitId || nouveauStockConstate === '') return;

    const pId = Number(ajustementProduitId);
    const newStockValue = parseInt(nouveauStockConstate, 10);
    if (isNaN(newStockValue) || newStockValue < 0) return;

    const targetProduit = produits.find((p) => p.id === pId);
    if (!targetProduit || !targetProduit.id) return;

    let ancienStock = targetProduit.stock;
    let variantLabel: string | undefined = undefined;

    if (targetProduit.is_variable && targetProduit.variantes_detaillees && ajustementVariantId) {
      const v = targetProduit.variantes_detaillees.find((vr) => vr.id === ajustementVariantId);
      if (v) {
        ancienStock = v.stock;
        variantLabel = Object.entries(v.attributs).map(([k, val]) => `${k}: ${val}`).join(' · ');
      }
    }

    const delta = newStockValue - ancienStock;
    if (delta === 0) {
      onClose();
      return;
    }

    // Le serveur relit le stock actuel, applique l'ajustement et journalise, atomiquement
    // (voir server/src/routes/ajustementsStock.js) — évite de travailler sur un stock local
    // périmé.
    try {
      await apiPost('/ajustements-stock', {
        produit_id: pId,
        produit_nom: targetProduit.nom,
        variant_id: ajustementVariantId || undefined,
        variante: variantLabel,
        nouveau_stock: newStockValue,
        motif: ajustementMotif,
        commentaire: ajustementCommentaire.trim() || undefined,
        zone_id: targetProduit.zone_id,
        auteur: 'Gérant / Admin',
      });
      onClose();
      await onSaved();
    } catch (err) {
      await alert(err instanceof ApiError ? err.message : "Échec de l'enregistrement de l'ajustement.");
    }
  };

  return (
    <Modal
      isOpen={request !== null}
      onClose={onClose}
      title="Régularisation & Ajustement de Stock Audité"
    >
      <form onSubmit={handleSaveAjustement} className="space-y-4">
        <div>
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
            Produit concerné
          </label>
          <select
            required
            value={ajustementProduitId}
            onChange={(e) => {
              const pid = e.target.value ? Number(e.target.value) : '';
              setAjustementProduitId(pid);
              const pr = produits.find((p) => p.id === pid);
              if (pr?.is_variable && pr.variantes_detaillees && pr.variantes_detaillees.length > 0) {
                setAjustementVariantId(pr.variantes_detaillees[0].id);
                setNouveauStockConstate(pr.variantes_detaillees[0].stock.toString());
              } else {
                setAjustementVariantId('');
                setNouveauStockConstate(pr ? pr.stock.toString() : '0');
              }
            }}
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

        {/* Si produit variable, choisir la variante */}
        {(() => {
          const pr = produits.find((p) => p.id === ajustementProduitId);
          if (!pr || !pr.is_variable || !pr.variantes_detaillees || pr.variantes_detaillees.length === 0) {
            return null;
          }
          return (
            <div className="p-3 rounded-xl bg-slate-500/10 border border-slate-500/20 space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                Variante spécifique à ajuster
              </label>
              <select
                required
                value={ajustementVariantId}
                onChange={(e) => {
                  const vid = e.target.value;
                  setAjustementVariantId(vid);
                  const vr = pr.variantes_detaillees?.find((v) => v.id === vid);
                  if (vr) setNouveauStockConstate(vr.stock.toString());
                }}
                className="w-full glass-input px-3 py-2 rounded-lg text-xs font-semibold text-slate-900 dark:text-white"
              >
                {pr.variantes_detaillees.map((v) => {
                  const label = Object.entries(v.attributs).map(([k, val]) => `${k}: ${val}`).join(' · ');
                  return (
                    <option key={v.id} value={v.id}>
                      {label} (Stock actuel: {v.stock})
                    </option>
                  );
                })}
              </select>
            </div>
          );
        })()}

        {/* Stock comparison & delta */}
        {(() => {
          const pr = produits.find((p) => p.id === ajustementProduitId);
          let currentStock = pr?.stock ?? 0;
          if (pr?.is_variable && pr.variantes_detaillees && ajustementVariantId) {
            const vr = pr.variantes_detaillees.find((v) => v.id === ajustementVariantId);
            if (vr) currentStock = vr.stock;
          }
          const newStockVal = parseInt(nouveauStockConstate, 10) || 0;
          const delta = newStockVal - currentStock;

          return (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200/50 dark:border-white/10">
              <div>
                <span className="text-xs font-semibold text-slate-500 block">Stock Théorique Actuel</span>
                <span className="text-lg font-semibold text-slate-700 dark:text-slate-300">{currentStock} unités</span>
              </div>
              <div>
                <label className="text-xs font-semibold text-blue-600 dark:text-blue-400 block mb-0.5">
                  Nouveau Stock Constaté *
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={nouveauStockConstate}
                  onChange={(e) => setNouveauStockConstate(e.target.value)}
                  className="w-full glass-input px-3 py-1.5 rounded-lg text-base font-semibold text-slate-900 dark:text-white"
                />
              </div>
              {delta !== 0 && (
                <div className="col-span-2 pt-1 border-t border-slate-200/40 dark:border-white/5 flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-500">Variation calculée (Delta) :</span>
                  <span className={delta > 0 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-rose-600 dark:text-rose-400 font-semibold'}>
                    {delta > 0 ? `+${delta}` : delta} unités
                  </span>
                </div>
              )}
            </div>
          );
        })()}

        <div>
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
            Motif Obligatoire de l'Ajustement *
          </label>
          <select
            required
            value={ajustementMotif}
            onChange={(e) => setAjustementMotif(e.target.value as MotifAjustement)}
            className="w-full glass-input px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-900 dark:text-white"
          >
            <option value="inventaire">Écart constaté lors d'un inventaire physique</option>
            <option value="casse">Casse / Marchandise détériorée / Avariée</option>
            <option value="perte_vol">Perte inexpliquée / Vol suspecté</option>
            <option value="don_promo">Échantillon commercial / Produit offert / Démo</option>
            <option value="autre">Autre régularisation</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
            Commentaire / Justification (Optionnel)
          </label>
          <input
            type="text"
            value={ajustementCommentaire}
            onChange={(e) => setAjustementCommentaire(e.target.value)}
            placeholder="ex: Vérification tiroir caisse du 30/08, écran fissuré lors du déballage..."
            className="w-full glass-input px-3 py-2 rounded-xl text-xs text-slate-900 dark:text-white"
          />
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-200/50 dark:border-white/10">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" type="submit">
            Enregistrer l'Ajustement Audité
          </Button>
        </div>
      </form>
    </Modal>
  );
};
