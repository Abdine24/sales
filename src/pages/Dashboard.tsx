import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'framer-motion';
import {
  DollarSign,
  AlertTriangle,
  Package,
  TrendingUp,
  CreditCard,
  ArrowUpRight,
  ShoppingBag,
  Users,
  PlusCircle,
  CalendarDays,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { db } from '../db/db';
import { GlassCard } from '../components/ui/GlassCard';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { NavPage } from '../components/layout/Sidebar';
import { formatCfa } from '../utils/currency';
import { Modal } from '../components/ui/Modal';

interface DashboardProps {
  onNavigate: (page: NavPage) => void;
  activeZoneId: number | null;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate, activeZoneId }) => {
  const ventes = useLiveQuery(() => db.ventes.toArray(), []) || [];
  const lignesVente = useLiveQuery(() => db.lignes_vente.toArray(), []) || [];
  const produits = useLiveQuery(() => db.produits.toArray(), []) || [];
  const clients = useLiveQuery(() => db.clients.toArray(), []) || [];
  const achatsStock = useLiveQuery(() => db.achats_stock.orderBy('date').toArray(), []) || [];
  const today = new Date().toISOString().split('T')[0];
  const defaultStart = new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0];
  const [dateDebut, setDateDebut] = useState(defaultStart);
  const [dateFin, setDateFin] = useState(today);
  const [sellerDetailName, setSellerDetailName] = useState<string | null>(null);
  const [sellerFilter, setSellerFilter] = useState('');
  const [sellerSortAscending, setSellerSortAscending] = useState(false);

  const ventesFiltrees = useMemo(
    () => ventes.filter((vente) => {
      const date = vente.date.split('T')[0];
      return date >= dateDebut && date <= dateFin && (activeZoneId === null || vente.zone_id === activeZoneId);
    }),
    [ventes, dateDebut, dateFin, activeZoneId]
  );

  // KPI Calculations
  const totalCA = useMemo(() => {
    return ventesFiltrees.reduce((sum, v) => sum + (v.total || 0), 0);
  }, [ventesFiltrees]);

  const panierMoyen = ventesFiltrees.length > 0 ? totalCA / ventesFiltrees.length : 0;

  const coutAchats = useMemo(() => {
    const venteIds = new Set(ventesFiltrees.map((vente) => vente.id));
    const dernierCoutParProduit = new Map<number, number>();
    achatsStock.forEach((achat) => {
      if (achat.quantite > 0) {
        dernierCoutParProduit.set(achat.produit_id, achat.cout_total / achat.quantite);
      }
    });
    return lignesVente
      .filter((ligne) => venteIds.has(ligne.vente_id))
      .reduce(
        (sum, ligne) => sum + (ligne.cout_unitaire || dernierCoutParProduit.get(ligne.produit_id) || 0) * ligne.quantite,
        0
      );
  }, [achatsStock, lignesVente, ventesFiltrees]);

  const benefice = totalCA - coutAchats;
  const tauxMarge = totalCA > 0 ? (benefice / totalCA) * 100 : 0;

  const ventesParVendeur = useMemo(() => {
    const grouped = new Map<string, { nom: string; total: number; count: number }>();
    ventesFiltrees.forEach((vente) => {
      const nom = vente.vendeur_nom || 'Vendeur non renseigné';
      const current = grouped.get(nom) || { nom, total: 0, count: 0 };
      current.total += vente.total || 0;
      current.count += 1;
      grouped.set(nom, current);
    });
    return Array.from(grouped.values()).sort((first, second) => second.total - first.total);
  }, [ventesFiltrees]);

  const ventesDuVendeur = useMemo(() => {
    if (!sellerDetailName) return [];
    return ventesFiltrees
      .filter((vente) => (vente.vendeur_nom || 'Vendeur non renseigné') === sellerDetailName)
      .sort((first, second) => sellerSortAscending
        ? first.date.localeCompare(second.date)
        : second.date.localeCompare(first.date));
  }, [sellerDetailName, sellerSortAscending, ventesFiltrees]);

  const lignesParVente = (venteId: string) => lignesVente.filter((ligne) => ligne.vente_id === venteId);

  const totalCreances = useMemo(() => {
    return clients.reduce((sum, c) => sum + (c.total_dette || 0), 0);
  }, [clients]);

  const totalStockItems = useMemo(() => {
    return produits.filter((p) => activeZoneId === null || p.zone_id === activeZoneId).reduce((sum, p) => sum + (p.stock || 0), 0);
  }, [produits, activeZoneId]);

  const stockBasItems = useMemo(() => {
    return produits.filter((p) => (activeZoneId === null || p.zone_id === activeZoneId) && p.stock <= p.min_stock);
  }, [produits, activeZoneId]);

  // Recharts Chart Data (7 dernières journées)
  const chartData = useMemo(() => {
    const days: { [date: string]: { date: string; displayDate: string; total: number; count: number } } = {};
    const start = new Date(`${dateDebut}T00:00:00`);
    const end = new Date(`${dateFin}T00:00:00`);
    for (let d = new Date(start); d <= end && Object.keys(days).length < 31; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const displayDate = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
      days[dateStr] = { date: dateStr, displayDate, total: 0, count: 0 };
    }

    ventesFiltrees.forEach((v) => {
      const vDateStr = v.date.split('T')[0];
      if (days[vDateStr]) {
        days[vDateStr].total += v.total;
        days[vDateStr].count += 1;
      }
    });

    return Object.values(days);
  }, [ventesFiltrees, dateDebut, dateFin]);

  // Format Currency
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Tableau de Bord
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Aperçu analytique de l'activité, des stocks et du recouvrement des créances.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 glass-card px-3 py-2 rounded-xl">
            <CalendarDays className="w-4 h-4 text-blue-500" />
            <input type="date" value={dateDebut} onChange={(event) => setDateDebut(event.target.value)} className="bg-transparent text-xs text-slate-700 dark:text-slate-200" />
            <span className="text-xs text-slate-400">à</span>
            <input type="date" value={dateFin} onChange={(event) => setDateFin(event.target.value)} className="bg-transparent text-xs text-slate-700 dark:text-slate-200" />
          </div>
          <Button
            variant="glass"
            icon={<ShoppingBag className="w-4 h-4 text-blue-500" />}
            onClick={() => onNavigate('pos')}
          >
            Ouvrir la Caisse
          </Button>
          <Button
            variant="primary"
            icon={<PlusCircle className="w-4 h-4" />}
            onClick={() => onNavigate('stock')}
          >
            Ajouter un produit
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Card 1: Chiffre d'affaires */}
        <GlassCard hoverEffect className="relative min-w-0 overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Chiffre d'Affaires Total
            </span>
            <div className="p-2.5 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {formatCfa(totalCA)}
            </div>
            <Badge variant="green" size="sm">
              <TrendingUp className="w-3 h-3" /> +14.2%
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mt-2">{ventesFiltrees.length} transactions sur la période</p>
        </GlassCard>

        <GlassCard hoverEffect className="min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Panier Moyen</span>
            <div className="p-2.5 rounded-2xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <ShoppingBag className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-black text-slate-900 dark:text-white tracking-tight">{formatCfa(panierMoyen)}</div>
          <p className="text-xs text-slate-400 mt-2">Moyenne par transaction</p>
        </GlassCard>

        <GlassCard hoverEffect className={benefice >= 0 ? 'border-emerald-500/30' : 'border-rose-500/30'}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Bénéfice</span>
            <div className={`p-2.5 rounded-2xl ${benefice >= 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'}`}>
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className={`mt-3 text-2xl font-black tracking-tight ${benefice >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCfa(benefice)}</div>
          <p className="text-xs text-slate-400 mt-2">Marge estimée : {tauxMarge.toFixed(1)} %</p>
        </GlassCard>

        {/* Card 2: Créances Clients (Apple-style Red Alert) */}
        <GlassCard
          hoverEffect
          className={`relative min-w-0 overflow-hidden ${
            totalCreances > 0
              ? 'border-rose-500/40 bg-gradient-to-br from-rose-500/5 to-transparent'
              : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Créances en Attente
            </span>
            <div className="p-2.5 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-2xl font-black text-rose-600 dark:text-rose-400 tracking-tight">
              {formatCfa(totalCreances)}
            </div>
            {totalCreances > 0 && (
              <Badge variant="red" dot size="sm">
                Recouvrement urgent
              </Badge>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-slate-400">Dettes clients dues</span>
            <button
              onClick={() => onNavigate('clients')}
              className="text-blue-500 font-semibold hover:underline flex items-center gap-0.5"
            >
              Voir clients <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        </GlassCard>

        {/* Card 3: Stock Total */}
        <GlassCard hoverEffect className="min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Produits en Stock
            </span>
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Package className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {totalStockItems}
            </div>
            <Badge variant="green" size="sm">
              {produits.length} références
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mt-2">Disponibles à la vente</p>
        </GlassCard>

        {/* Card 4: Alertes Stock Bas */}
        <GlassCard hoverEffect className={`min-w-0 ${stockBasItems.length > 0 ? 'border-amber-500/40' : ''}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Alertes Stock Bas
            </span>
            <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400 tracking-tight">
              {stockBasItems.length}
            </div>
            {stockBasItems.length > 0 && (
              <Badge variant="amber" dot size="sm">
                Réappro à prévoir
              </Badge>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-slate-400">Articles sous le seuil</span>
            <button
              onClick={() => onNavigate('stock')}
              className="text-blue-500 font-semibold hover:underline flex items-center gap-0.5"
            >
              Commander <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        </GlassCard>
      </div>

      <GlassCard className="min-w-0 overflow-hidden">
        <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-200/50 dark:border-white/10">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Ventes par vendeur</h3>
            <p className="text-xs text-slate-400">Résultats de la période et du magasin sélectionnés.</p>
          </div>
          <Users className="w-5 h-5 text-blue-500 shrink-0" />
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {ventesParVendeur.length === 0 ? (
            <p className="text-sm text-slate-400 py-4">Aucune vente sur cette période.</p>
          ) : ventesParVendeur.map((vendeur) => (
            <div key={vendeur.nom} className="min-w-0 rounded-xl bg-slate-100/60 dark:bg-slate-800/40 p-3">
              <div className="font-bold text-slate-900 dark:text-white truncate">{vendeur.nom}</div>
              <div className="text-xs text-slate-400">{vendeur.count} vente(s)</div>
              <div className="mt-2 text-lg font-black text-blue-600 dark:text-blue-400 truncate">{formatCfa(vendeur.total)}</div>
              <button onClick={() => setSellerDetailName(vendeur.nom)} className="mt-2 text-xs font-bold text-blue-600 hover:underline">
                Voir plus
              </button>
            </div>
          ))}
        </div>
      </GlassCard>

      {sellerDetailName && (
        <Modal
          isOpen={!!sellerDetailName}
          onClose={() => { setSellerDetailName(null); setSellerFilter(''); setSellerSortAscending(false); }}
          title={`Ventes de ${sellerDetailName}`}
          maxWidth="xl"
        >
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-sm text-slate-500">{ventesDuVendeur.length} vente(s), {sellerSortAscending ? 'de la plus ancienne à la plus récente' : 'de la plus récente à la plus ancienne'}.</div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={sellerFilter}
                  onChange={(event) => setSellerFilter(event.target.value)}
                  placeholder="Filtrer un produit ou une vente..."
                  className="glass-input px-3 py-2 rounded-xl text-sm w-full sm:w-72"
                />
                <Button
                  variant="glass"
                  size="sm"
                  onClick={() => setSellerSortAscending((ascending) => !ascending)}
                >
                  {sellerSortAscending ? 'Plus récent d’abord' : 'Plus ancien d’abord'}
                </Button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto space-y-3">
              {ventesDuVendeur.filter((vente) => {
                const query = sellerFilter.toLowerCase().trim();
                if (!query) return true;
                return vente.date.includes(query) || lignesParVente(vente.id).some((ligne) => ligne.produit_nom.toLowerCase().includes(query));
              }).map((vente) => (
                <div key={vente.id} className="p-4 rounded-2xl border border-slate-200/60 dark:border-white/10 bg-slate-50/50 dark:bg-slate-900/30">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">{new Date(vente.date).toLocaleString('fr-FR')}</div>
                      <div className="text-xs text-slate-400">{vente.methode_paiement.toUpperCase()} · {vente.statut}</div>
                    </div>
                    <div className="font-black text-blue-600">{formatCfa(vente.total)}</div>
                  </div>
                  <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    {lignesParVente(vente.id).map((ligne) => (
                      <div key={ligne.id} className="flex justify-between gap-3">
                        <span className="truncate">{ligne.produit_nom}{ligne.variante ? ` - ${ligne.variante}` : ''} × {ligne.quantite}</span>
                        <span className="shrink-0">{formatCfa(ligne.prix_unitaire * ligne.quantite)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {/* Main Chart Section */}
      <GlassCard className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 mb-2 gap-2">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Évolution du Chiffre d'Affaires
            </h3>
            <p className="text-xs text-slate-400">
              Ventes quotidiennes sur la période sélectionnée.
            </p>
          </div>
          <Badge variant="purple" size="md">
            Graphique Interactif Recharts
          </Badge>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#007AFF" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#007AFF" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
              <XAxis
                dataKey="displayDate"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#94a3b8', fontSize: 12 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                tickFormatter={(v) => `${v} CFA`}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="glass-card p-3 rounded-xl border border-white/40 shadow-xl text-xs space-y-1">
                        <p className="font-bold text-slate-900 dark:text-white">{label}</p>
                        <p className="text-blue-600 dark:text-blue-400 font-extrabold text-sm">
                          {formatCfa(Number(payload[0].value))}
                        </p>
                        <p className="text-slate-400">
                          {payload[0].payload.count} transaction(s)
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#007AFF"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#salesGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      {/* Grid bottom widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Widget 1: Recent Debtors */}
        <GlassCard>
          <div className="flex items-center justify-between pb-4 border-b border-slate-200/50 dark:border-white/10 mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-rose-500" />
              <h3 className="font-bold text-slate-900 dark:text-white">
                Clients avec Créances
              </h3>
            </div>
            <button
              onClick={() => onNavigate('clients')}
              className="text-xs text-blue-500 font-semibold hover:underline"
            >
              Tout voir
            </button>
          </div>

          <div className="space-y-3">
            {clients.filter((c) => c.total_dette > 0).length === 0 ? (
              <p className="text-xs text-slate-400 italic py-4 text-center">
                Aucune créance client en attente. Félicitations !
              </p>
            ) : (
              clients
                .filter((c) => c.total_dette > 0)
                .slice(0, 4)
                .map((client) => (
                  <div
                    key={client.id}
                    className="flex items-center justify-between p-3 rounded-2xl bg-slate-100/50 dark:bg-slate-800/40 border border-slate-200/40 dark:border-white/5"
                  >
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                        {client.nom}
                      </h4>
                      <p className="text-xs text-slate-400">{client.telephone}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-rose-600 dark:text-rose-400">
                        {formatCfa(client.total_dette)}
                      </div>
                      <Badge variant="red" size="sm">
                        Dette
                      </Badge>
                    </div>
                  </div>
                ))
            )}
          </div>
        </GlassCard>

        {/* Widget 2: Low Stock Warning */}
        <GlassCard>
          <div className="flex items-center justify-between pb-4 border-b border-slate-200/50 dark:border-white/10 mb-4">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-amber-500" />
              <h3 className="font-bold text-slate-900 dark:text-white">
                Alertes Réapprovisionnement
              </h3>
            </div>
            <button
              onClick={() => onNavigate('stock')}
              className="text-xs text-blue-500 font-semibold hover:underline"
            >
              Gérer le stock
            </button>
          </div>

          <div className="space-y-3">
            {stockBasItems.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-4 text-center">
                Tous vos stocks sont au-dessus des seuils minimaux.
              </p>
            ) : (
              stockBasItems.slice(0, 4).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 rounded-2xl bg-amber-500/5 border border-amber-500/20"
                >
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {item.nom}
                    </h4>
                    <p className="text-xs text-slate-400">Code: {item.code_barres}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-amber-600 dark:text-amber-400">
                      Reste: {item.stock} unit.
                    </div>
                    <span className="text-[10px] text-slate-400">Seuil min: {item.min_stock}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );
};
