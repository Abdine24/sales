import React, { useState } from 'react';
import {
  Plus,
  Search,
  Truck,
  X,
  Filter,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  ArrowUpDown,
  Boxes,
  Calendar,
  DollarSign,
} from 'lucide-react';
import type {
  Produit,
  AchatStock,
  Fournisseur,
} from '../../db/db';
import { GlassCard } from '../../components/ui/GlassCard';
import { Button } from '../../components/ui/Button';
import { DateRangePicker } from '../../components/ui/DateRangePicker';
import { formatCfa } from '../../utils/currency';


interface AchatsTabProps {
  achats: AchatStock[];
  produits: Produit[];
  fournisseurs: Fournisseur[];
  activeZoneId: number | null;
  onRestock: (p?: Produit, variantId?: string) => void;
}

/** Onglet « Historique des réapprovisionnements » de la page Stock : filtres, totaux, liste. */
export const AchatsTab: React.FC<AchatsTabProps> = ({ achats, produits, fournisseurs, activeZoneId, onRestock }) => {
  // Tab 2: Achats Filter & Pagination State
  const [searchAchats, setSearchAchats] = useState('');
  const [supplierFilterAchats, setSupplierFilterAchats] = useState<number | 'Tous'>('Tous');
  const [dateFilterAchats, setDateFilterAchats] = useState<'all' | 'today' | '7d' | '30d' | 'this_month' | 'custom'>('all');
  const [dateDebutAchats, setDateDebutAchats] = useState<string>('');
  const [dateFinAchats, setDateFinAchats] = useState<string>('');
  const [sortByAchats, setSortByAchats] = useState<'date-desc' | 'date-asc' | 'cout-desc' | 'cout-asc' | 'quantite-desc' | 'quantite-asc'>('date-desc');
  const [pageSizeAchats, setPageSizeAchats] = useState<number>(10);
  const [currentPageAchats, setCurrentPageAchats] = useState<number>(1);

  // --- TAB 2 : ACHATS (Calculs, Filtres & Pagination) ---
  const zoneAchats = achats.filter((a) => {
    if (activeZoneId === null) return true;
    const prod = produits.find((p) => p.id === a.produit_id);
    return prod ? prod.zone_id === activeZoneId : true;
  });

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOf7d = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const startOf30d = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const filteredAchats = zoneAchats
    .filter((a) => {
      const matchSearch =
        (a.produit_nom || '').toLowerCase().includes(searchAchats.toLowerCase()) ||
        (a.fournisseur_nom || '').toLowerCase().includes(searchAchats.toLowerCase()) ||
        (Boolean(a.variante) && (a.variante || '').toLowerCase().includes(searchAchats.toLowerCase()));

      const matchSupplier =
        supplierFilterAchats === 'Tous' || a.fournisseur_id === Number(supplierFilterAchats);

      const aTime = new Date(a.date).getTime();
      const aDate = new Date(a.date);
      const aDateStr =
        aDate.getFullYear() +
        '-' +
        String(aDate.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(aDate.getDate()).padStart(2, '0');

      let matchDate = true;
      if (dateFilterAchats === 'today') matchDate = aTime >= startOfDay;
      else if (dateFilterAchats === '7d') matchDate = aTime >= startOf7d;
      else if (dateFilterAchats === '30d') matchDate = aTime >= startOf30d;
      else if (dateFilterAchats === 'this_month') matchDate = aTime >= startOfMonth;
      else if (dateFilterAchats === 'custom') {
        if (dateDebutAchats && dateFinAchats) {
          matchDate = aDateStr >= dateDebutAchats && aDateStr <= dateFinAchats;
        } else if (dateDebutAchats) {
          matchDate = aDateStr >= dateDebutAchats;
        } else if (dateFinAchats) {
          matchDate = aDateStr <= dateFinAchats;
        }
      }

      return matchSearch && matchSupplier && matchDate;
    })
    .sort((a, b) => {
      if (sortByAchats === 'date-desc') return new Date(b.date).getTime() - new Date(a.date).getTime();
      if (sortByAchats === 'date-asc') return new Date(a.date).getTime() - new Date(b.date).getTime();
      if (sortByAchats === 'cout-desc') return (b.cout_total || 0) - (a.cout_total || 0);
      if (sortByAchats === 'cout-asc') return (a.cout_total || 0) - (b.cout_total || 0);
      if (sortByAchats === 'quantite-desc') return (b.quantite || 0) - (a.quantite || 0);
      if (sortByAchats === 'quantite-asc') return (a.quantite || 0) - (b.quantite || 0);
      return 0;
    });

  const totalFilteredAchats = filteredAchats.length;
  const effectivePageSizeAchats = pageSizeAchats === 9999 ? (totalFilteredAchats || 1) : pageSizeAchats;
  const totalPagesAchats = Math.max(1, Math.ceil(totalFilteredAchats / effectivePageSizeAchats));
  const validCurrentPageAchats = Math.min(Math.max(currentPageAchats, 1), totalPagesAchats);
  const startIndexAchats = (validCurrentPageAchats - 1) * effectivePageSizeAchats;
  const endIndexAchats = Math.min(startIndexAchats + effectivePageSizeAchats, totalFilteredAchats);
  const paginatedAchats = filteredAchats.slice(startIndexAchats, endIndexAchats);

  const totalQuantiteAchats = filteredAchats.reduce((sum, a) => sum + (a.quantite || 0), 0);
  const totalDepensesAchats = filteredAchats.reduce((sum, a) => sum + (a.cout_total || 0), 0);

  const isFilteredAchats =
    searchAchats !== '' ||
    supplierFilterAchats !== 'Tous' ||
    dateFilterAchats !== 'all' ||
    dateDebutAchats !== '' ||
    dateFinAchats !== '' ||
    sortByAchats !== 'date-desc';

  const resetAllFiltersAchats = () => {
    setSearchAchats('');
    setSupplierFilterAchats('Tous');
    setDateFilterAchats('all');
    setDateDebutAchats('');
    setDateFinAchats('');
    setSortByAchats('date-desc');
    setCurrentPageAchats(1);
  };

  return (
    <div className="space-y-4">
      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <GlassCard className="p-3.5 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 font-semibold block">Total Réapprovisionnements</span>
            <span className="text-xl font-semibold text-slate-900 dark:text-white mt-0.5 block">
              {totalFilteredAchats} réception(s)
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <Truck className="w-5 h-5" />
          </div>
        </GlassCard>

        <GlassCard className="p-3.5 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 font-semibold block">Volume Total Réceptionné</span>
            <span className="text-xl font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5 block">
              +{totalQuantiteAchats} unités
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Boxes className="w-5 h-5" />
          </div>
        </GlassCard>

        <GlassCard className="p-3.5 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 font-semibold block">Total Dépenses d'Achat</span>
            <span className="text-xl font-semibold text-slate-900 dark:text-white mt-0.5 block">
              {formatCfa(totalDepensesAchats)}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-500/10 text-slate-600 dark:text-slate-400">
            <DollarSign className="w-5 h-5" />
          </div>
        </GlassCard>
      </div>

      {/* Filter & Search Bar for Achats */}
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Rechercher par produit, fournisseur, variante..."
            value={searchAchats}
            onChange={(e) => { setSearchAchats(e.target.value); setCurrentPageAchats(1); }}
            className="w-full glass-input pl-10 pr-4 py-2.5 rounded-xl text-sm text-slate-900 dark:text-white"
          />
          {searchAchats && (
            <button
              onClick={() => setSearchAchats('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500">Fournisseur:</span>
            <select
              value={supplierFilterAchats}
              onChange={(e) => { setSupplierFilterAchats(e.target.value === 'Tous' ? 'Tous' : Number(e.target.value)); setCurrentPageAchats(1); }}
              className="glass-input px-3 py-2 rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
            >
              <option value="Tous">Tous les fournisseurs</option>
              {fournisseurs.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nom}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Période:
            </span>
            <select
              value={dateFilterAchats}
              onChange={(e) => { setDateFilterAchats(e.target.value as typeof dateFilterAchats); setCurrentPageAchats(1); }}
              className="glass-input px-3 py-2 rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
            >
              <option value="all">Toutes dates</option>
              <option value="today">Aujourd'hui</option>
              <option value="7d">7 derniers jours</option>
              <option value="30d">30 derniers jours</option>
              <option value="this_month">Ce mois-ci</option>
              <option value="custom">Plage de dates...</option>
            </select>
            {dateFilterAchats === 'custom' && (
              <DateRangePicker
                startDate={dateDebutAchats}
                endDate={dateFinAchats}
                align="left"
                onChange={(start, end) => {
                  setDateDebutAchats(start);
                  setDateFinAchats(end);
                  setCurrentPageAchats(1);
                }}
              />
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <ArrowUpDown className="w-3.5 h-3.5" /> Tri:
            </span>
            <select
              value={sortByAchats}
              onChange={(e) => setSortByAchats(e.target.value as typeof sortByAchats)}
              className="glass-input px-3 py-2 rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
            >
              <option value="date-desc">Date (Plus récent)</option>
              <option value="date-asc">Date (Plus ancien)</option>
              <option value="cout-desc">Coût total (Plus élevé)</option>
              <option value="cout-asc">Coût total (Moins élevé)</option>
              <option value="quantite-desc">Quantité (Plus forte)</option>
              <option value="quantite-asc">Quantité (Plus faible)</option>
            </select>
          </div>

          {isFilteredAchats && (
            <button
              onClick={resetAllFiltersAchats}
              className="px-3 py-2 rounded-xl glass-card hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-1 transition-colors"
              title="Réinitialiser les filtres"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Réinitialiser</span>
            </button>
          )}
        </div>
      </div>

      {/* Achats Table */}
      <GlassCard className="p-0 overflow-hidden">
        {/* --- Réapprovisionnements en cartes : mobile uniquement. Le produit
            et la quantité entrée passent en tête ; fournisseur, coût unitaire
            et date deviennent secondaires. --- */}
        <div className="md:hidden divide-y divide-slate-200/40 dark:divide-white/5">
          {totalFilteredAchats === 0 ? (
            <div className="p-10 flex flex-col items-center justify-center space-y-2 text-center">
              <Truck className="w-10 h-10 text-slate-300 dark:text-slate-600" />
              <p className="text-base font-semibold text-slate-700 dark:text-slate-300">
                Aucun réapprovisionnement ne correspond à vos critères
              </p>
              <p className="text-xs text-slate-500">
                Modifiez votre recherche ou réinitialisez les filtres.
              </p>
              {isFilteredAchats && (
                <Button variant="glass" size="sm" onClick={resetAllFiltersAchats} className="mt-2">
                  Réinitialiser les filtres
                </Button>
              )}
            </div>
          ) : (
            paginatedAchats.map((a) => (
              <div key={a.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-white truncate">
                      {a.produit_nom}
                    </div>
                    {a.variante && (
                      <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-slate-500/10 text-slate-600 dark:text-slate-400 text-xs font-semibold">
                        {a.variante}
                      </span>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                      +{a.quantite}
                    </div>
                    <div className="text-xs text-slate-500">unités</div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-slate-500 dark:text-slate-400 truncate">
                    {a.fournisseur_nom}
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-white whitespace-nowrap selectable">
                    {formatCfa(a.cout_total)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span>{new Date(a.date).toLocaleString('fr-FR')}</span>
                  <span className="whitespace-nowrap">
                    {formatCfa(a.cout_unitaire ?? a.cout_total / (a.quantite || 1))} / u.
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/50 dark:border-white/10 bg-slate-50/50 dark:bg-slate-900/40 text-xs text-slate-500 uppercase tracking-wide">
                <th className="p-4 font-semibold">Date & Heure</th>
                <th className="p-4 font-semibold">Fournisseur</th>
                <th className="p-4 font-semibold">Produit</th>
                <th className="p-4 font-semibold">Variante</th>
                <th className="p-4 font-semibold">Quantité Réappro</th>
                <th className="p-4 font-semibold">Coût Unitaire</th>
                <th className="p-4 font-semibold">Coût Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/40 dark:divide-white/5 text-sm">
              {totalFilteredAchats === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Truck className="w-10 h-10 text-slate-300 dark:text-slate-600" />
                      <p className="text-base font-semibold text-slate-700 dark:text-slate-300">
                        Aucun réapprovisionnement ne correspond à vos critères
                      </p>
                      <p className="text-xs text-slate-500">
                        Modifiez votre recherche ou réinitialisez les filtres.
                      </p>
                      {isFilteredAchats && (
                        <Button variant="glass" size="sm" onClick={resetAllFiltersAchats} className="mt-2">
                          Réinitialiser les filtres
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedAchats.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-100/40 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="p-4 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(a.date).toLocaleString('fr-FR')}
                    </td>
                    <td className="p-4 font-semibold text-slate-900 dark:text-white">
                      {a.fournisseur_nom}
                    </td>
                    <td className="p-4 font-semibold text-slate-700 dark:text-slate-300">
                      {a.produit_nom}
                    </td>
                    <td className="p-4 text-xs text-slate-500">
                      {a.variante ? (
                        <span className="px-2 py-0.5 rounded-md bg-slate-500/10 text-slate-600 dark:text-slate-400 font-semibold">
                          {a.variante}
                        </span>
                      ) : (
                        <span className="text-slate-500 italic">—</span>
                      )}
                    </td>
                    <td className="p-4 font-semibold text-emerald-600 dark:text-emerald-400">
                      +{a.quantite} unités
                    </td>
                    <td className="p-4 font-semibold text-slate-600 dark:text-slate-300">
                      {formatCfa(a.cout_unitaire ?? (a.cout_total / (a.quantite || 1)))}
                    </td>
                    <td className="p-4 font-semibold text-slate-900 dark:text-white">
                      {formatCfa(a.cout_total)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls for Achats */}
        {totalFilteredAchats > 0 && (
          <div className="p-4 border-t border-slate-200/50 dark:border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-900/30">
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>
                Affichage de <strong className="text-slate-900 dark:text-white">{startIndexAchats + 1}</strong> à{' '}
                <strong className="text-slate-900 dark:text-white">{endIndexAchats}</strong> sur{' '}
                <strong className="text-slate-900 dark:text-white">{totalFilteredAchats}</strong> achats
              </span>

              <div className="flex items-center gap-1.5 ml-2">
                <span>Par page:</span>
                <select
                  value={pageSizeAchats}
                  onChange={(e) => {
                    setPageSizeAchats(Number(e.target.value));
                    setCurrentPageAchats(1);
                  }}
                  className="glass-input px-2 py-1 rounded-lg text-xs font-semibold text-slate-900 dark:text-white"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={9999}>Tous</option>
                </select>
              </div>
            </div>

            {totalPagesAchats > 1 && (
              <div className="flex items-center gap-2">
                {pageSizeAchats < 100 && endIndexAchats < totalFilteredAchats && (
                  <button
                    onClick={() => setPageSizeAchats((prev) => prev + 25)}
                    className="px-3 py-1.5 rounded-xl glass-card hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-blue-600 dark:text-blue-400 mr-2"
                  >
                    + Voir 25 de plus
                  </button>
                )}

                <button
                  disabled={validCurrentPageAchats <= 1}
                  onClick={() => setCurrentPageAchats((p) => Math.max(1, p - 1))}
                  className="p-2 rounded-xl glass-card disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                  title="Page précédente"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 px-2">
                  Page {validCurrentPageAchats} / {totalPagesAchats}
                </span>

                <button
                  disabled={validCurrentPageAchats >= totalPagesAchats}
                  onClick={() => setCurrentPageAchats((p) => Math.min(totalPagesAchats, p + 1))}
                  className="p-2 rounded-xl glass-card disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                  title="Page suivante"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </GlassCard>
    </div>
  );
};
