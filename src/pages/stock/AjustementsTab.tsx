import React, { useState } from 'react';
import {
  Plus,
  Search,
  X,
  Scale,
  FileText,
  Filter,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  ArrowUpDown,
  Boxes,
  ShieldAlert,
  Gift,
  ClipboardCheck,
  Flame,
  TrendingUp,
  TrendingDown,
  Calendar,
} from 'lucide-react';
import type {
  Produit,
  AjustementStock,
  MotifAjustement,
} from '../../db/db';
import { GlassCard } from '../../components/ui/GlassCard';
import { Button } from '../../components/ui/Button';
import { DateRangePicker } from '../../components/ui/DateRangePicker';

// Libellés, couleurs et icônes des motifs d'ajustement. Défini au niveau module
// et non dans la boucle de rendu : il est partagé par la vue mobile (cartes) et
// la vue desktop (tableau), et n'a aucune raison d'être reconstruit à chaque
// ligne affichée.
const MOTIF_AJUSTEMENT_INFOS: Record<MotifAjustement, { label: string; color: string; icon: React.ReactNode }> = {
  inventaire: {
    label: 'Inventaire physique',
    color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    icon: <ClipboardCheck className="w-3.5 h-3.5" />,
  },
  casse: {
    label: 'Casse / Avarié',
    color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    icon: <Flame className="w-3.5 h-3.5" />,
  },
  perte_vol: {
    label: 'Perte / Vol',
    color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    icon: <ShieldAlert className="w-3.5 h-3.5" />,
  },
  don_promo: {
    label: 'Échantillon / Don',
    color: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
    icon: <Gift className="w-3.5 h-3.5" />,
  },
  autre: {
    label: 'Autre motif',
    color: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
    icon: <FileText className="w-3.5 h-3.5" />,
  },
};


interface AjustementsTabProps {
  ajustements: AjustementStock[];
  produits: Produit[];
  activeZoneId: number | null;
  onAdjust: (p?: Produit, variantId?: string) => void;
}

/** Onglet « Journal des ajustements » de la page Stock : motifs, filtres, totaux, liste. */
export const AjustementsTab: React.FC<AjustementsTabProps> = ({ ajustements, produits, activeZoneId, onAdjust }) => {
  // Tab 3: Ajustements Filter & Pagination State
  const [searchAjustements, setSearchAjustements] = useState('');
  const [motifFilterAjustements, setMotifFilterAjustements] = useState<MotifAjustement | 'all'>('all');
  const [dateFilterAjustements, setDateFilterAjustements] = useState<'all' | 'today' | '7d' | '30d' | 'this_month' | 'custom'>('all');
  const [dateDebutAjustements, setDateDebutAjustements] = useState<string>('');
  const [dateFinAjustements, setDateFinAjustements] = useState<string>('');
  const [directionFilterAjustements, setDirectionFilterAjustements] = useState<'all' | 'positive' | 'negative'>('all');
  const [sortByAjustements, setSortByAjustements] = useState<'date-desc' | 'date-asc' | 'delta-desc' | 'delta-asc'>('date-desc');
  const [pageSizeAjustements, setPageSizeAjustements] = useState<number>(10);
  const [currentPageAjustements, setCurrentPageAjustements] = useState<number>(1);

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOf7d = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const startOf30d = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  // --- TAB 3 : AJUSTEMENTS (Calculs, Filtres & Pagination) ---
  const zoneAjustements = ajustements.filter((aj) => {
    if (activeZoneId === null) return true;
    return aj.zone_id === activeZoneId;
  });

  const countAjustementsAll = zoneAjustements.length;
  const countAjustementsInventaire = zoneAjustements.filter((a) => a.motif === 'inventaire').length;
  const countAjustementsCasse = zoneAjustements.filter((a) => a.motif === 'casse').length;
  const countAjustementsPerte = zoneAjustements.filter((a) => a.motif === 'perte_vol').length;
  const countAjustementsDon = zoneAjustements.filter((a) => a.motif === 'don_promo').length;
  const countAjustementsAutre = zoneAjustements.filter((a) => a.motif === 'autre').length;

  const filteredAjustements = zoneAjustements
    .filter((aj) => {
      const matchSearch =
        (aj.produit_nom || '').toLowerCase().includes(searchAjustements.toLowerCase()) ||
        (Boolean(aj.variante) && (aj.variante || '').toLowerCase().includes(searchAjustements.toLowerCase())) ||
        (Boolean(aj.commentaire) && (aj.commentaire || '').toLowerCase().includes(searchAjustements.toLowerCase()));

      const matchMotif =
        motifFilterAjustements === 'all' || aj.motif === motifFilterAjustements;

      let matchDirection = true;
      if (directionFilterAjustements === 'positive') matchDirection = aj.delta > 0;
      else if (directionFilterAjustements === 'negative') matchDirection = aj.delta < 0;

      const ajTime = new Date(aj.date).getTime();
      const ajDate = new Date(aj.date);
      const ajDateStr =
        ajDate.getFullYear() +
        '-' +
        String(ajDate.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(ajDate.getDate()).padStart(2, '0');

      let matchDate = true;
      if (dateFilterAjustements === 'today') matchDate = ajTime >= startOfDay;
      else if (dateFilterAjustements === '7d') matchDate = ajTime >= startOf7d;
      else if (dateFilterAjustements === '30d') matchDate = ajTime >= startOf30d;
      else if (dateFilterAjustements === 'this_month') matchDate = ajTime >= startOfMonth;
      else if (dateFilterAjustements === 'custom') {
        if (dateDebutAjustements && dateFinAjustements) {
          matchDate = ajDateStr >= dateDebutAjustements && ajDateStr <= dateFinAjustements;
        } else if (dateDebutAjustements) {
          matchDate = ajDateStr >= dateDebutAjustements;
        } else if (dateFinAjustements) {
          matchDate = ajDateStr <= dateFinAjustements;
        }
      }

      return matchSearch && matchMotif && matchDirection && matchDate;
    })
    .sort((a, b) => {
      if (sortByAjustements === 'date-desc') return new Date(b.date).getTime() - new Date(a.date).getTime();
      if (sortByAjustements === 'date-asc') return new Date(a.date).getTime() - new Date(b.date).getTime();
      if (sortByAjustements === 'delta-desc') return b.delta - a.delta;
      if (sortByAjustements === 'delta-asc') return a.delta - b.delta;
      return 0;
    });

  const totalFilteredAjustements = filteredAjustements.length;
  const effectivePageSizeAjustements = pageSizeAjustements === 9999 ? (totalFilteredAjustements || 1) : pageSizeAjustements;
  const totalPagesAjustements = Math.max(1, Math.ceil(totalFilteredAjustements / effectivePageSizeAjustements));
  const validCurrentPageAjustements = Math.min(Math.max(currentPageAjustements, 1), totalPagesAjustements);
  const startIndexAjustements = (validCurrentPageAjustements - 1) * effectivePageSizeAjustements;
  const endIndexAjustements = Math.min(startIndexAjustements + effectivePageSizeAjustements, totalFilteredAjustements);
  const paginatedAjustements = filteredAjustements.slice(startIndexAjustements, endIndexAjustements);

  const totalDeltaPositif = filteredAjustements.filter((a) => a.delta > 0).reduce((sum, a) => sum + a.delta, 0);
  const totalDeltaNegatif = filteredAjustements.filter((a) => a.delta < 0).reduce((sum, a) => sum + a.delta, 0);

  const isFilteredAjustements =
    searchAjustements !== '' ||
    motifFilterAjustements !== 'all' ||
    dateFilterAjustements !== 'all' ||
    dateDebutAjustements !== '' ||
    dateFinAjustements !== '' ||
    directionFilterAjustements !== 'all' ||
    sortByAjustements !== 'date-desc';

  const resetAllFiltersAjustements = () => {
    setSearchAjustements('');
    setMotifFilterAjustements('all');
    setDateFilterAjustements('all');
    setDateDebutAjustements('');
    setDateFinAjustements('');
    setDirectionFilterAjustements('all');
    setSortByAjustements('date-desc');
    setCurrentPageAjustements(1);
  };

  return (
    <div className="space-y-4">
      {/* KPI Summary Cards for Adjustments */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <GlassCard className="p-3.5 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 font-semibold block">Total Événements Audit</span>
            <span className="text-xl font-semibold text-slate-900 dark:text-white mt-0.5 block">
              {totalFilteredAjustements} ajustement(s)
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-500/10 text-slate-600 dark:text-slate-400">
            <Scale className="w-5 h-5" />
          </div>
        </GlassCard>

        <GlassCard className="p-3.5 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 font-semibold block">Régularisations Positives (+)</span>
            <span className="text-xl font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5 block">
              +{totalDeltaPositif} unités
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <TrendingUp className="w-5 h-5" />
          </div>
        </GlassCard>

        <GlassCard className="p-3.5 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 font-semibold block">Pertes / Casses Constatées (-)</span>
            <span className="text-xl font-semibold text-rose-600 dark:text-rose-400 mt-0.5 block">
              {totalDeltaNegatif} unités
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
            <TrendingDown className="w-5 h-5" />
          </div>
        </GlassCard>
      </div>

      {/* Quick Motif Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1 shrink-0 mr-1">
          <Filter className="w-3.5 h-3.5" /> Motifs :
        </span>
        <button
          onClick={() => { setMotifFilterAjustements('all'); setCurrentPageAjustements(1); }}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 flex items-center gap-1.5 ${
            motifFilterAjustements === 'all'
              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
              : 'glass-card text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
          }`}
        >
          <Boxes className="w-3.5 h-3.5" />
          <span>Tous</span>
          <span className="text-xs px-1.5 py-0.2 rounded-md bg-black/10 dark:bg-white/20 font-semibold">
            {countAjustementsAll}
          </span>
        </button>
        <button
          onClick={() => { setMotifFilterAjustements('inventaire'); setCurrentPageAjustements(1); }}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 flex items-center gap-1.5 ${
            motifFilterAjustements === 'inventaire'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'glass-card text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30'
          }`}
        >
          <ClipboardCheck className="w-3.5 h-3.5 text-blue-500" />
          <span>Inventaire</span>
          <span className="text-xs px-1.5 py-0.2 rounded-md bg-blue-500/20 font-semibold">
            {countAjustementsInventaire}
          </span>
        </button>
        <button
          onClick={() => { setMotifFilterAjustements('casse'); setCurrentPageAjustements(1); }}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 flex items-center gap-1.5 ${
            motifFilterAjustements === 'casse'
              ? 'bg-amber-500 text-white shadow-sm'
              : 'glass-card text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30'
          }`}
        >
          <Flame className="w-3.5 h-3.5 text-amber-500" />
          <span>Casse / Avarié</span>
          <span className="text-xs px-1.5 py-0.2 rounded-md bg-amber-500/20 font-semibold">
            {countAjustementsCasse}
          </span>
        </button>
        <button
          onClick={() => { setMotifFilterAjustements('perte_vol'); setCurrentPageAjustements(1); }}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 flex items-center gap-1.5 ${
            motifFilterAjustements === 'perte_vol'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'glass-card text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
          <span>Perte / Vol</span>
          <span className="text-xs px-1.5 py-0.2 rounded-md bg-rose-500/20 font-semibold">
            {countAjustementsPerte}
          </span>
        </button>
        <button
          onClick={() => { setMotifFilterAjustements('don_promo'); setCurrentPageAjustements(1); }}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 flex items-center gap-1.5 ${
            motifFilterAjustements === 'don_promo'
              ? 'bg-slate-600 text-white shadow-sm'
              : 'glass-card text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-950/30'
          }`}
        >
          <Gift className="w-3.5 h-3.5 text-slate-500" />
          <span>Don / Démo</span>
          <span className="text-xs px-1.5 py-0.2 rounded-md bg-slate-500/20 font-semibold">
            {countAjustementsDon}
          </span>
        </button>
        <button
          onClick={() => { setMotifFilterAjustements('autre'); setCurrentPageAjustements(1); }}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 flex items-center gap-1.5 ${
            motifFilterAjustements === 'autre'
              ? 'bg-slate-600 text-white shadow-sm'
              : 'glass-card text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Autre</span>
          <span className="text-xs px-1.5 py-0.2 rounded-md bg-slate-500/20 font-semibold">
            {countAjustementsAutre}
          </span>
        </button>
      </div>

      {/* Filter & Search Bar for Ajustements */}
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Rechercher par produit, variante, commentaire..."
            value={searchAjustements}
            onChange={(e) => { setSearchAjustements(e.target.value); setCurrentPageAjustements(1); }}
            className="w-full glass-input pl-10 pr-4 py-2.5 rounded-xl text-sm text-slate-900 dark:text-white"
          />
          {searchAjustements && (
            <button
              onClick={() => setSearchAjustements('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Période:
            </span>
            <select
              value={dateFilterAjustements}
              onChange={(e) => { setDateFilterAjustements(e.target.value as typeof dateFilterAjustements); setCurrentPageAjustements(1); }}
              className="glass-input px-3 py-2 rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
            >
              <option value="all">Toutes dates</option>
              <option value="today">Aujourd'hui</option>
              <option value="7d">7 derniers jours</option>
              <option value="30d">30 derniers jours</option>
              <option value="this_month">Ce mois-ci</option>
              <option value="custom">Plage de dates...</option>
            </select>
            {dateFilterAjustements === 'custom' && (
              <DateRangePicker
                startDate={dateDebutAjustements}
                endDate={dateFinAjustements}
                align="left"
                onChange={(start, end) => {
                  setDateDebutAjustements(start);
                  setDateFinAjustements(end);
                  setCurrentPageAjustements(1);
                }}
              />
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500">Sens variation:</span>
            <select
              value={directionFilterAjustements}
              onChange={(e) => { setDirectionFilterAjustements(e.target.value as typeof directionFilterAjustements); setCurrentPageAjustements(1); }}
              className="glass-input px-3 py-2 rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
            >
              <option value="all">Toutes variations</option>
              <option value="positive">Entrées positives (+)</option>
              <option value="negative">Sorties / Pertes (-)</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <ArrowUpDown className="w-3.5 h-3.5" /> Tri:
            </span>
            <select
              value={sortByAjustements}
              onChange={(e) => setSortByAjustements(e.target.value as typeof sortByAjustements)}
              className="glass-input px-3 py-2 rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
            >
              <option value="date-desc">Date (Plus récent)</option>
              <option value="date-asc">Date (Plus ancien)</option>
              <option value="delta-desc">Écart (Plus fort positif)</option>
              <option value="delta-asc">Écart (Plus forte perte)</option>
            </select>
          </div>

          {isFilteredAjustements && (
            <button
              onClick={resetAllFiltersAjustements}
              className="px-3 py-2 rounded-xl glass-card hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-1 transition-colors"
              title="Réinitialiser les filtres"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Réinitialiser</span>
            </button>
          )}
        </div>
      </div>

      {/* Ajustements Table */}
      <GlassCard className="p-0 overflow-hidden">
        {/* --- Ajustements en cartes : mobile uniquement. La variation (+/-)
            et le motif sont ce qu'on vient vérifier ; l'ancien et le nouveau
            stock restent lisibles mais en second plan. --- */}
        <div className="md:hidden divide-y divide-slate-200/40 dark:divide-white/5">
          {totalFilteredAjustements === 0 ? (
            <div className="p-10 flex flex-col items-center justify-center space-y-2 text-center">
              <Scale className="w-10 h-10 text-slate-300 dark:text-slate-600" />
              <p className="text-base font-semibold text-slate-700 dark:text-slate-300">
                Aucun ajustement ne correspond à vos filtres
              </p>
              <p className="text-xs text-slate-500">
                Modifiez vos critères de recherche ou réinitialisez les filtres.
              </p>
              {isFilteredAjustements && (
                <Button variant="glass" size="sm" onClick={resetAllFiltersAjustements} className="mt-2">
                  Réinitialiser les filtres
                </Button>
              )}
            </div>
          ) : (
            paginatedAjustements.map((aj) => {
              const isPositive = aj.delta > 0;
              const motifInfo = MOTIF_AJUSTEMENT_INFOS[aj.motif] || MOTIF_AJUSTEMENT_INFOS.autre;
              return (
                <div key={aj.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-white truncate">
                        {aj.produit_nom}
                      </div>
                      {aj.variante && (
                        <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-slate-500/10 text-slate-600 dark:text-slate-400 text-xs font-semibold">
                          {aj.variante}
                        </span>
                      )}
                    </div>
                    <span
                      className={`shrink-0 px-2.5 py-1 rounded-lg text-sm font-semibold whitespace-nowrap ${
                        isPositive
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {isPositive ? `+${aj.delta}` : aj.delta}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${motifInfo.color}`}
                    >
                      {motifInfo.icon}
                      <span>{motifInfo.label}</span>
                    </span>
                    <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-500/10 text-slate-600 dark:text-slate-300">
                      {aj.ancien_stock} → {aj.nouveau_stock}
                    </span>
                  </div>

                  {aj.commentaire && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 italic">{aj.commentaire}</p>
                  )}

                  <div className="text-xs text-slate-500">
                    {new Date(aj.date).toLocaleString('fr-FR')}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/50 dark:border-white/10 bg-slate-50/50 dark:bg-slate-900/40 text-xs text-slate-500 uppercase tracking-wide">
                <th className="p-4 font-semibold">Date & Heure</th>
                <th className="p-4 font-semibold">Produit</th>
                <th className="p-4 font-semibold">Variante</th>
                <th className="p-4 font-semibold">Stock Initial</th>
                <th className="p-4 font-semibold">Stock Rectifié</th>
                <th className="p-4 font-semibold">Variation</th>
                <th className="p-4 font-semibold">Motif Justifié</th>
                <th className="p-4 font-semibold">Commentaire</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/40 dark:divide-white/5 text-sm">
              {totalFilteredAjustements === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Scale className="w-10 h-10 text-slate-300 dark:text-slate-600" />
                      <p className="text-base font-semibold text-slate-700 dark:text-slate-300">
                        Aucun ajustement ne correspond à vos filtres
                      </p>
                      <p className="text-xs text-slate-500">
                        Modifiez vos critères de recherche ou réinitialisez les filtres.
                      </p>
                      {isFilteredAjustements && (
                        <Button variant="glass" size="sm" onClick={resetAllFiltersAjustements} className="mt-2">
                          Réinitialiser les filtres
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedAjustements.map((aj) => {
                  const isPositive = aj.delta > 0;
                  const motifInfo = MOTIF_AJUSTEMENT_INFOS[aj.motif] || MOTIF_AJUSTEMENT_INFOS.autre;

                  return (
                    <tr key={aj.id} className="hover:bg-slate-100/40 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="p-4 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(aj.date).toLocaleString('fr-FR')}
                      </td>
                      <td className="p-4 font-semibold text-slate-900 dark:text-white">
                        {aj.produit_nom}
                      </td>
                      <td className="p-4 text-xs text-slate-500">
                        {aj.variante ? (
                          <span className="px-2 py-0.5 rounded-md bg-slate-500/10 text-slate-600 dark:text-slate-400 font-semibold">
                            {aj.variante}
                          </span>
                        ) : (
                          <span className="text-slate-500 italic">—</span>
                        )}
                      </td>
                      <td className="p-4 text-slate-500 font-medium">
                        {aj.ancien_stock}
                      </td>
                      <td className="p-4 font-semibold text-slate-900 dark:text-white">
                        {aj.nouveau_stock}
                      </td>
                      <td className="p-4 font-semibold whitespace-nowrap">
                        <span
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                            isPositive
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {isPositive ? `+${aj.delta}` : aj.delta}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 w-fit ${motifInfo.color}`}>
                          {motifInfo.icon}
                          <span>{motifInfo.label}</span>
                        </span>
                      </td>
                      <td className="p-4 text-xs text-slate-500 italic max-w-xs truncate">
                        {aj.commentaire || '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls for Ajustements */}
        {totalFilteredAjustements > 0 && (
          <div className="p-4 border-t border-slate-200/50 dark:border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-900/30">
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>
                Affichage de <strong className="text-slate-900 dark:text-white">{startIndexAjustements + 1}</strong> à{' '}
                <strong className="text-slate-900 dark:text-white">{endIndexAjustements}</strong> sur{' '}
                <strong className="text-slate-900 dark:text-white">{totalFilteredAjustements}</strong> ajustements
              </span>

              <div className="flex items-center gap-1.5 ml-2">
                <span>Par page:</span>
                <select
                  value={pageSizeAjustements}
                  onChange={(e) => {
                    setPageSizeAjustements(Number(e.target.value));
                    setCurrentPageAjustements(1);
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

            {totalPagesAjustements > 1 && (
              <div className="flex items-center gap-2">
                {pageSizeAjustements < 100 && endIndexAjustements < totalFilteredAjustements && (
                  <button
                    onClick={() => setPageSizeAjustements((prev) => prev + 25)}
                    className="px-3 py-1.5 rounded-xl glass-card hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-blue-600 dark:text-blue-400 mr-2"
                  >
                    + Voir 25 de plus
                  </button>
                )}

                <button
                  disabled={validCurrentPageAjustements <= 1}
                  onClick={() => setCurrentPageAjustements((p) => Math.max(1, p - 1))}
                  className="p-2 rounded-xl glass-card disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                  title="Page précédente"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 px-2">
                  Page {validCurrentPageAjustements} / {totalPagesAjustements}
                </span>

                <button
                  disabled={validCurrentPageAjustements >= totalPagesAjustements}
                  onClick={() => setCurrentPageAjustements((p) => Math.min(totalPagesAjustements, p + 1))}
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
