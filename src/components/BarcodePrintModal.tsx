import React, { useState, useMemo } from 'react';
import { Printer } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { BarcodeRenderer } from './BarcodeRenderer';
import { Produit, AppSettings } from '../db/db';
import { formatCfa } from '../utils/currency';
import { printBarcodeLabelsDirect } from '../utils/barcode';

interface BarcodePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  produit: Produit | null;
  settings: AppSettings | null;
}

export const BarcodePrintModal: React.FC<BarcodePrintModalProps> = ({
  isOpen,
  onClose,
  produit,
  settings,
}) => {
  const [selectedVariantId, setSelectedVariantId] = useState<string>('all');
  const [quantity, setQuantity] = useState<number>(8);
  const [format, setFormat] = useState<'a4' | 'thermal'>('a4');
  const [showPrice, setShowPrice] = useState<boolean>(true);
  const [showStoreName, setShowStoreName] = useState<boolean>(true);
  const [showProductName, setShowProductName] = useState<boolean>(true);

  // Étiquettes à imprimer
  const labelsToPrint = useMemo(() => {
    if (!produit) return [];

    const items: Array<{
      nom: string;
      code_barres: string;
      prix: number;
      varianteLabel?: string;
    }> = [];

    if (produit.is_variable && produit.variantes_detaillees && produit.variantes_detaillees.length > 0) {
      if (selectedVariantId === 'all') {
        // Toutes les variantes
        produit.variantes_detaillees.forEach((v) => {
          // Afficher directement les valeurs (ex: Titane · 256Go)
          const varLabel = Object.values(v.attributs || {})
            .filter(Boolean)
            .join(' · ');
          items.push({
            nom: produit.nom,
            code_barres: v.code_barres || produit.code_barres || '0000000000000',
            prix: v.prix || produit.prix,
            varianteLabel: varLabel,
          });
        });
      } else {
        // Une variante spécifique
        const v = produit.variantes_detaillees.find((vr) => vr.id === selectedVariantId);
        if (v) {
          const varLabel = Object.values(v.attributs || {})
            .filter(Boolean)
            .join(' · ');
          items.push({
            nom: produit.nom,
            code_barres: v.code_barres || produit.code_barres || '0000000000000',
            prix: v.prix || produit.prix,
            varianteLabel: varLabel,
          });
        }
      }
    } else {
      // Produit simple
      items.push({
        nom: produit.nom,
        code_barres: produit.code_barres || '0000000000000',
        prix: produit.prix,
      });
    }

    // Répétition selon la quantité choisie
    const duplicated: typeof items = [];
    for (let i = 0; i < quantity; i++) {
      items.forEach((it) => duplicated.push({ ...it }));
    }

    return duplicated;
  }, [produit, selectedVariantId, quantity]);

  const handlePrint = () => {
    printBarcodeLabelsDirect({
      labels: labelsToPrint,
      format,
      storeName: settings?.nom_site || '',
      showStoreName,
      showProductName,
      showPrice,
    });
  };

  if (!produit) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Impression d'Étiquettes Code-barres" maxWidth="3xl">
      <div className="space-y-4">
        {/* Print Configuration Controls */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-white/10 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {produit.is_variable && produit.variantes_detaillees && (
            <div>
              <label className="font-bold text-slate-500 mb-1 block">Déclinaison / Variante</label>
              <select
                value={selectedVariantId}
                onChange={(e) => setSelectedVariantId(e.target.value)}
                className="w-full glass-input px-2.5 py-2 rounded-xl text-xs font-semibold"
              >
                <option value="all">Toutes les variantes ({produit.variantes_detaillees.length})</option>
                {produit.variantes_detaillees.map((v) => {
                  const varLabel = Object.values(v.attributs || {})
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <option key={v.id} value={v.id}>
                      {varLabel}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          <div>
            <label className="font-bold text-slate-500 mb-1 block">Nombre de copies</label>
            <input
              type="number"
              min="1"
              max="200"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-full glass-input px-2.5 py-2 rounded-xl text-xs font-bold"
            />
          </div>

          <div>
            <label className="font-bold text-slate-500 mb-1 block">Support d'impression</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as 'a4' | 'thermal')}
              className="w-full glass-input px-2.5 py-2 rounded-xl text-xs font-semibold"
            >
              <option value="a4">Planche A4 (Stickers Grille)</option>
              <option value="thermal">Rouleau Thermique (50x30 mm)</option>
            </select>
          </div>

          <div className="flex flex-col justify-end gap-1 text-[11px]">
            <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={showProductName}
                onChange={(e) => setShowProductName(e.target.checked)}
                className="rounded text-blue-600"
              />
              Nom du produit
            </label>
            <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={showPrice}
                onChange={(e) => setShowPrice(e.target.checked)}
                className="rounded text-blue-600"
              />
              Afficher le Prix (F)
            </label>
            <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={showStoreName}
                onChange={(e) => setShowStoreName(e.target.checked)}
                className="rounded text-blue-600"
              />
              Nom de la boutique
            </label>
          </div>
        </div>

        {/* Live Visual Printable Preview */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Aperçu avant impression ({labelsToPrint.length} étiquette{labelsToPrint.length > 1 ? 's' : ''})
            </span>
          </div>

          <div className="max-h-80 overflow-y-auto p-4 rounded-2xl bg-slate-200/50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10">
            <div
              id="printable-barcode-sheet"
              className={
                format === 'a4'
                  ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 bg-white p-4 rounded-xl text-slate-900 shadow-xs'
                  : 'flex flex-col items-center gap-4 bg-white p-4 rounded-xl text-slate-900 max-w-xs mx-auto shadow-xs'
              }
            >
              {labelsToPrint.map((lbl, idx) => (
                <div
                  key={idx}
                  className="barcode-sticker border border-slate-300 rounded-lg p-2 flex flex-col items-center justify-between text-center bg-white min-h-[105px] w-full overflow-hidden box-border"
                >
                  {showStoreName && (
                    <div className="text-[9px] uppercase font-black tracking-wider text-slate-500 truncate w-full">
                      {settings?.nom_site || 'Boutique'}
                    </div>
                  )}

                  {showProductName && (
                    <div className="font-bold text-[11px] text-slate-900 truncate w-full leading-tight mt-0.5">
                      {lbl.nom}
                    </div>
                  )}

                  {lbl.varianteLabel && (
                    <div className="text-[10px] font-bold text-purple-800 dark:text-purple-900 truncate w-full leading-tight">
                      {lbl.varianteLabel}
                    </div>
                  )}

                  <div className="my-1 flex justify-center w-full max-w-full overflow-hidden px-1">
                    <BarcodeRenderer value={lbl.code_barres} height={32} showText />
                  </div>

                  {showPrice && (
                    <div className="text-[11px] font-black text-blue-700 leading-tight">
                      {formatCfa(lbl.prix)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200/50 dark:border-white/10">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" icon={<Printer className="w-4 h-4" />} onClick={handlePrint}>
            Lancer l'impression ({labelsToPrint.length} étiquettes)
          </Button>
        </div>
      </div>
    </Modal>
  );
};
