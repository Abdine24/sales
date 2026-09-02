import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'framer-motion';
import {
  DollarSign,
  AlertTriangle,
  Package,
  TrendingUp,
  TrendingDown,
  CreditCard,
  ArrowUpRight,
  ShoppingBag,
  Users,
  PlusCircle,
  CalendarDays,
  Download,
  Star,
  Award,
  Store,
  Search,
  Filter,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  Calendar,
  SlidersHorizontal,
  ArrowUpDown,
  Banknote,
  Smartphone,
  Receipt,
  CheckCircle2,
  FileSpreadsheet,
  Eye,
  X,
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
import { formatCfa, formatCfaCompact } from '../utils/currency';
import { Modal } from '../components/ui/Modal';
import { DateRangePicker } from '../components/ui/DateRangePicker';
import { useAuth } from '../hooks/useAuth';

interface DashboardProps {
  onNavigate: (page: NavPage) => void;
  activeZoneId: number | null;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate, activeZoneId }) => {
  const { personnel } = useAuth();
  const ventes = useLiveQuery(() => db.ventes.toArray(), []) || [];
  const lignesVente = useLiveQuery(() => db.lignes_vente.toArray(), []) || [];
  const produits = useLiveQuery(() => db.produits.toArray(), []) || [];
  const clients = useLiveQuery(() => db.clients.toArray(), []) || [];
  const achatsStock = useLiveQuery(() => db.achats_stock.orderBy('date').toArray(), []) || [];
  const retours = useLiveQuery(() => db.retours.toArray(), []) || [];
  const zones = useLiveQuery(() => db.zones.toArray(), []) || [];
  const today = new Date().toISOString().split('T')[0];
  const defaultStart = new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0];
  const [dateDebut, setDateDebut] = useState(defaultStart);
  const [dateFin, setDateFin] = useState(today);

  // Seller Section Filters (Dashboard Level)
  const [sellerSearch, setSellerSearch] = useState('');
  const [sellerSort, setSellerSort] = useState<'ca-desc' | 'ca-asc' | 'ventes-desc' | 'nom-asc'>('ca-desc');

  // Seller Modal Filter State
  const [sellerDetailName, setSellerDetailName] = useState<string | null>(null);
  const [sellerModalSearch, setSellerModalSearch] = useState('');
  const [sellerModalDatePreset, setSellerModalDatePreset] = useState<'all' | 'today' | '7d' | '30d' | 'this_month' | 'custom'>('all');
  const [sellerModalDateDebut, setSellerModalDateDebut] = useState('');
  const [sellerModalDateFin, setSellerModalDateFin] = useState('');
  const [sellerModalPayment, setSellerModalPayment] = useState<'all' | 'especes' | 'mobile_money' | 'virement'>('all');
  const [sellerModalStatus, setSellerModalStatus] = useState<'all' | 'paye' | 'partiel' | 'credit'>('all');
  const [sellerModalSort, setSellerModalSort] = useState<'date-desc' | 'date-asc' | 'total-desc' | 'total-asc'>('date-desc');
  const [sellerModalPage, setSellerModalPage] = useState<number>(1);
  const [sellerModalPageSize, setSellerModalPageSize] = useState<number>(10);

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportOptions, setExportOptions] = useState({
    ventes: true,
    clients: true,
    stock: true,
  });

  const ventesFiltrees = useMemo(
    () => ventes.filter((vente) => {
      const date = vente.date.split('T')[0];
      const matchZone = activeZoneId === null || vente.zone_id === activeZoneId;
      const matchVendeur = personnel?.role === 'admin' ? true : vente.vendeur_id === personnel?.id;
      return date >= dateDebut && date <= dateFin && matchZone && matchVendeur;
    }),
    [ventes, dateDebut, dateFin, activeZoneId, personnel]
  );

  // Retours sur la période affichée (mêmes filtres que les ventes) — à déduire du CA affiché,
  // sinon un article rapporté par un client resterait compté dans le chiffre d'affaires.
  const retoursFiltres = useMemo(
    () => retours.filter((retour) => {
      const date = retour.date.split('T')[0];
      const matchZone = activeZoneId === null || retour.zone_id === activeZoneId;
      const matchVendeur = personnel?.role === 'admin' ? true : retour.vendeur_id === personnel?.id;
      return date >= dateDebut && date <= dateFin && matchZone && matchVendeur;
    }),
    [retours, dateDebut, dateFin, activeZoneId, personnel]
  );

  const totalRetours = useMemo(
    () => retoursFiltres.reduce((sum, r) => sum + (r.montant_total || 0), 0),
    [retoursFiltres]
  );

  // KPI Calculations
  const totalCA = useMemo(() => {
    const brut = ventesFiltrees.reduce((sum, v) => sum + (v.total || 0), 0);
    return Math.max(0, brut - totalRetours);
  }, [ventesFiltrees, totalRetours]);

  const panierMoyen = ventesFiltrees.length > 0 ? totalCA / ventesFiltrees.length : 0;

  // Chiffre d'affaires de la période précédente de même durée, pour une variation réelle
  const caPrecedent = useMemo(() => {
    const msDay = 86400000;
    const start = new Date(`${dateDebut}T00:00:00`).getTime();
    const end = new Date(`${dateFin}T00:00:00`).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
    const spanDays = Math.round((end - start) / msDay) + 1;
    const prevEndDate = new Date(start - msDay);
    const prevStartDate = new Date(prevEndDate.getTime() - (spanDays - 1) * msDay);
    const prevDebut = prevStartDate.toISOString().split('T')[0];
    const prevFin = prevEndDate.toISOString().split('T')[0];
    return ventes
      .filter((vente) => {
        const date = vente.date.split('T')[0];
        const matchZone = activeZoneId === null || vente.zone_id === activeZoneId;
        const matchVendeur = personnel?.role === 'admin' ? true : vente.vendeur_id === personnel?.id;
        return date >= prevDebut && date <= prevFin && matchZone && matchVendeur;
      })
      .reduce((sum, v) => sum + (v.total || 0), 0);
  }, [ventes, dateDebut, dateFin, activeZoneId, personnel]);

  const caVariation = caPrecedent && caPrecedent > 0 ? ((totalCA - caPrecedent) / caPrecedent) * 100 : null;

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

  // Grouped Sales by Seller on Dashboard
  const rawVentesParVendeur = useMemo(() => {
    const grouped = new Map<string, { nom: string; total: number; count: number; identifiant?: string }>();
    ventesFiltrees.forEach((vente) => {
      const nom = vente.vendeur_nom || 'Vendeur non renseigné';
      const current = grouped.get(nom) || {
        nom,
        total: 0,
        count: 0,
        identifiant: vente.vendeur_identifiant,
      };
      current.total += vente.total || 0;
      current.count += 1;
      if (!current.identifiant && vente.vendeur_identifiant) {
        current.identifiant = vente.vendeur_identifiant;
      }
      grouped.set(nom, current);
    });
    return Array.from(grouped.values());
  }, [ventesFiltrees]);

  const filteredVentesParVendeur = useMemo(() => {
    let list = [...rawVentesParVendeur];

    if (sellerSearch.trim()) {
      const q = sellerSearch.toLowerCase().trim();
      list = list.filter(
        (v) =>
          v.nom.toLowerCase().includes(q) ||
          (v.identifiant && v.identifiant.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => {
      if (sellerSort === 'ca-desc') return b.total - a.total;
      if (sellerSort === 'ca-asc') return a.total - b.total;
      if (sellerSort === 'ventes-desc') return b.count - a.count;
      if (sellerSort === 'nom-asc') return a.nom.localeCompare(b.nom);
      return 0;
    });

    return list;
  }, [rawVentesParVendeur, sellerSearch, sellerSort]);

  // Filtered sales in Seller Detail Modal
  const ventesDuVendeurFiltrees = useMemo(() => {
    if (!sellerDetailName) return [];

    const msPerDay = 86400000;
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    let effectiveStart = '';
    let effectiveEnd = '';

    if (sellerModalDatePreset === 'today') {
      effectiveStart = todayStr;
      effectiveEnd = todayStr;
    } else if (sellerModalDatePreset === '7d') {
      effectiveStart = new Date(Date.now() - 6 * msPerDay).toISOString().split('T')[0];
      effectiveEnd = todayStr;
    } else if (sellerModalDatePreset === '30d') {
      effectiveStart = new Date(Date.now() - 29 * msPerDay).toISOString().split('T')[0];
      effectiveEnd = todayStr;
    } else if (sellerModalDatePreset === 'this_month') {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      effectiveStart = `${year}-${month}-01`;
      effectiveEnd = todayStr;
    } else if (sellerModalDatePreset === 'custom') {
      effectiveStart = sellerModalDateDebut;
      effectiveEnd = sellerModalDateFin;
    }

    const query = sellerModalSearch.toLowerCase().trim();

    return ventes
      .filter((vente) => {
        if ((vente.vendeur_nom || 'Vendeur non renseigné') !== sellerDetailName) return false;
        if (activeZoneId !== null && vente.zone_id !== activeZoneId) return false;

        const venteDate = vente.date.split('T')[0];

        if (effectiveStart && venteDate < effectiveStart) return false;
        if (effectiveEnd && venteDate > effectiveEnd) return false;

        if (sellerModalPayment !== 'all' && vente.methode_paiement !== sellerModalPayment) return false;
        if (sellerModalStatus !== 'all' && vente.statut !== sellerModalStatus) return false;

        if (query) {
          const matchCustomer = (vente.client_nom || '').toLowerCase().includes(query);
          const matchVenteId = (vente.id || '').toLowerCase().includes(query);
          const matchLines = lignesVente
            .filter((l) => l.vente_id === vente.id)
            .some((l) =>
              (l.produit_nom || '').toLowerCase().includes(query) ||
              (l.variante || '').toLowerCase().includes(query)
            );
          if (!matchCustomer && !matchVenteId && !matchLines) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sellerModalSort === 'date-desc') return b.date.localeCompare(a.date);
        if (sellerModalSort === 'date-asc') return a.date.localeCompare(b.date);
        if (sellerModalSort === 'total-desc') return (b.total || 0) - (a.total || 0);
        if (sellerModalSort === 'total-asc') return (a.total || 0) - (b.total || 0);
        return 0;
      });
  }, [
    sellerDetailName,
    ventes,
    lignesVente,
    activeZoneId,
    sellerModalDatePreset,
    sellerModalDateDebut,
    sellerModalDateFin,
    sellerModalPayment,
    sellerModalStatus,
    sellerModalSearch,
    sellerModalSort,
  ]);

  const sellerModalStats = useMemo(() => {
    const totalCa = ventesDuVendeurFiltrees.reduce((sum, v) => sum + (v.total || 0), 0);
    const countSales = ventesDuVendeurFiltrees.length;
    const panierMoyen = countSales > 0 ? totalCa / countSales : 0;
    const totalItems = ventesDuVendeurFiltrees.reduce((sum, v) => {
      const lines = lignesVente.filter((l) => l.vente_id === v.id);
      return sum + lines.reduce((sub, l) => sub + (l.quantite || 0), 0);
    }, 0);

    return { totalCa, countSales, panierMoyen, totalItems };
  }, [ventesDuVendeurFiltrees, lignesVente]);

  const totalSellerModalPages = Math.max(1, Math.ceil(ventesDuVendeurFiltrees.length / sellerModalPageSize));
  const paginatedSellerSales = useMemo(() => {
    const start = (sellerModalPage - 1) * sellerModalPageSize;
    return ventesDuVendeurFiltrees.slice(start, start + sellerModalPageSize);
  }, [ventesDuVendeurFiltrees, sellerModalPage, sellerModalPageSize]);

  const resetSellerModalFilters = () => {
    setSellerModalSearch('');
    setSellerModalDatePreset('all');
    setSellerModalDateDebut('');
    setSellerModalDateFin('');
    setSellerModalPayment('all');
    setSellerModalStatus('all');
    setSellerModalSort('date-desc');
    setSellerModalPage(1);
  };

  const handleOpenSellerDetail = (sellerName: string) => {
    setSellerDetailName(sellerName);
    resetSellerModalFilters();
  };

  const handleExportSellerSalesCSV = () => {
    if (!sellerDetailName || ventesDuVendeurFiltrees.length === 0) return;
    const header = [
      'Date & Heure',
      'Réf Vente',
      'Client',
      'Vendeur',
      'Paiement',
      'Statut',
      'Produit',
      'Variante',
      'Quantité',
      'Prix Unitaire (CFA)',
      'Total Ligne (CFA)',
      'Total Vente (CFA)',
    ].join(',');

    const rows: string[] = [];
    ventesDuVendeurFiltrees.forEach((v) => {
      const lines = lignesVente.filter((l) => l.vente_id === v.id);
      if (lines.length === 0) {
        rows.push([
          `"${new Date(v.date).toLocaleString('fr-FR')}"`,
          `"${v.id}"`,
          `"${(v.client_nom || 'Client Passant').replace(/"/g, '""')}"`,
          `"${(v.vendeur_nom || '').replace(/"/g, '""')}"`,
          `"${v.methode_paiement}"`,
          `"${v.statut}"`,
          '""',
          '""',
          '0',
          '0',
          '0',
          `"${v.total || 0}"`,
        ].join(','));
      } else {
        lines.forEach((l) => {
          rows.push([
            `"${new Date(v.date).toLocaleString('fr-FR')}"`,
            `"${v.id}"`,
            `"${(v.client_nom || 'Client Passant').replace(/"/g, '""')}"`,
            `"${(v.vendeur_nom || '').replace(/"/g, '""')}"`,
            `"${v.methode_paiement}"`,
            `"${v.statut}"`,
            `"${(l.produit_nom || '').replace(/"/g, '""')}"`,
            `"${(l.variante || '').replace(/"/g, '""')}"`,
            `"${l.quantite}"`,
            `"${l.prix_unitaire}"`,
            `"${l.prix_unitaire * l.quantite}"`,
            `"${v.total || 0}"`,
          ].join(','));
        });
      }
    });

    const csvContent = '\uFEFF' + [header, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ventes_${sellerDetailName.toLowerCase().replace(/[^a-z0-9]/gi, '_')}_${today}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const lignesParVente = (venteId: string) => lignesVente.filter((ligne) => ligne.vente_id === venteId);

  const totalCreances = useMemo(() => {
    return clients.reduce((sum, c) => sum + (c.total_dette || 0), 0);
  }, [clients]);

  const topClients = useMemo(() => {
    const map = new Map<string, number>();
    ventesFiltrees.forEach(v => {
      if (v.client_nom && v.client_nom !== 'Client Passant') {
        map.set(v.client_nom, (map.get(v.client_nom) || 0) + v.total);
      }
    });
    return Array.from(map.entries())
      .map(([nom, total]) => ({ nom, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [ventesFiltrees]);

  const topProduits = useMemo(() => {
    const venteIds = new Set(ventesFiltrees.map(v => v.id));
    const lignesValides = lignesVente.filter(l => venteIds.has(l.vente_id));
    
    const dernierCoutParProduit = new Map<number, number>();
    achatsStock.forEach(achat => {
      if (achat.quantite > 0) {
        dernierCoutParProduit.set(achat.produit_id, achat.cout_total / achat.quantite);
      }
    });

    const map = new Map<number, { nom: string; qte: number; ca: number; benefice: number }>();

    lignesValides.forEach(l => {
      const cout = l.cout_unitaire || dernierCoutParProduit.get(l.produit_id) || 0;
      const ca = l.prix_unitaire * l.quantite;
      const benef = ca - (cout * l.quantite);

      const current = map.get(l.produit_id) || { nom: l.produit_nom, qte: 0, ca: 0, benefice: 0 };
      current.qte += l.quantite;
      current.ca += ca;
      current.benefice += benef;
      map.set(l.produit_id, current);
    });

    const array = Array.from(map.values());
    const byQte = [...array].sort((a, b) => b.qte - a.qte).slice(0, 5);
    const byBenefice = [...array].sort((a, b) => b.benefice - a.benefice).slice(0, 5);

    return { byQte, byBenefice };
  }, [ventesFiltrees, lignesVente, achatsStock]);

  const topZones = useMemo(() => {
    const map = new Map<number, { nom: string; ca: number }>();
    ventesFiltrees.forEach(v => {
      const zoneId = v.zone_id || 0;
      const current = map.get(zoneId) || { nom: 'Général', ca: 0 };
      current.ca += v.total;
      map.set(zoneId, current);
    });

    return Array.from(map.entries()).map(([id, data]) => {
      const realZone = zones.find(z => z.id === id);
      return { nom: realZone ? realZone.nom : (id === 0 ? 'Toutes Boutiques' : data.nom), ca: data.ca };
    }).sort((a, b) => b.ca - a.ca).slice(0, 5);
  }, [ventesFiltrees, zones]);

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

  const handleExport = () => {
    const downloadCSV = (filename: string, content: string) => {
      const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), content], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    if (exportOptions.ventes) {
      const header = ['Date', 'Réf Vente', 'Client', 'Statut', 'Paiement', 'Vendeur', 'Produit', 'Variante', 'Quantité', 'Prix Unitaire (F)', 'Total Ligne (F)'].join(',');
      const rows = ventesFiltrees.flatMap(v => {
        const lignes = lignesParVente(v.id);
        if (lignes.length === 0) {
          return [[
            `"${new Date(v.date).toLocaleString('fr-FR')}"`,
            `"${v.id.substring(0, 8)}"`,
            `"${(v.client_nom || 'Client Passant').replace(/"/g, '""')}"`,
            `"${v.statut}"`,
            `"${v.methode_paiement}"`,
            `"${(v.vendeur_nom || '').replace(/"/g, '""')}"`,
            `""`, `""`, `""`, `""`, `""`
          ].join(',')];
        }
        return lignes.map(l => [
          `"${new Date(v.date).toLocaleString('fr-FR')}"`,
          `"${v.id.substring(0, 8)}"`,
          `"${(v.client_nom || 'Client Passant').replace(/"/g, '""')}"`,
          `"${v.statut}"`,
          `"${v.methode_paiement}"`,
          `"${(v.vendeur_nom || '').replace(/"/g, '""')}"`,
          `"${l.produit_nom.replace(/"/g, '""')}"`,
          `"${l.variante || ''}"`,
          l.quantite,
          l.prix_unitaire,
          l.prix_unitaire * l.quantite
        ].join(','));
      });
      downloadCSV(`export_ventes_detaillees_${dateDebut}_au_${dateFin}.csv`, [header, ...rows].join('\n'));
    }

    if (exportOptions.clients) {
      const header = ['Nom', 'Téléphone', 'Email', 'Créances (F)'].join(',');
      const rows = clients.map(c => [
        `"${c.nom.replace(/"/g, '""')}"`,
        `"${c.telephone}"`,
        `"${c.email || ''}"`,
        c.total_dette
      ].join(','));
      downloadCSV(`export_clients_${today}.csv`, [header, ...rows].join('\n'));
    }

    if (exportOptions.stock) {
      const header = ['Nom Produit', 'Catégorie', 'Code Barres', 'Stock', 'Prix Vente (F)'].join(',');
      const rows = produits.map(p => [
        `"${p.nom.replace(/"/g, '""')}"`,
        `"${p.categorie}"`,
        `"${p.code_barres}"`,
        p.stock,
        p.prix
      ].join(','));
      downloadCSV(`export_stock_${today}.csv`, [header, ...rows].join('\n'));
    }

    setIsExportModalOpen(false);
  };

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
          <DateRangePicker
            startDate={dateDebut}
            endDate={dateFin}
            onChange={(start, end) => {
              setDateDebut(start);
              setDateFin(end);
            }}
          />
          <Button
            variant="glass"
            icon={<Download className="w-4 h-4 text-blue-500" />}
            onClick={() => setIsExportModalOpen(true)}
          >
            CSV
          </Button>
          <Button
            variant="glass"
            icon={<ShoppingBag className="w-4 h-4 text-blue-500" />}
            onClick={() => onNavigate('pos')}
          >
            Caisse
          </Button>
          <Button
            variant="primary"
            icon={<PlusCircle className="w-4 h-4" />}
            onClick={() => onNavigate('stock')}
            title="Ajouter un produit"
          />
        </div>
      </div>

      {/* KPI Cards Grid (Largeur aérée et chiffres complets sans coupure) */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 ${personnel?.role === 'admin' ? '2xl:grid-cols-6' : '2xl:grid-cols-5'} gap-4`}>
        {/* Card 1: Chiffre d'affaires */}
        <GlassCard hoverEffect className="relative min-w-0 overflow-hidden p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
              Chiffre d'Affaires
            </span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-2 min-w-0 flex-wrap">
            <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight whitespace-nowrap" title={formatCfa(totalCA)}>
              {formatCfa(totalCA)}
            </div>
            {caVariation !== null && (
              <Badge variant={caVariation >= 0 ? 'green' : 'red'} size="sm" className="shrink-0 whitespace-nowrap">
                {caVariation >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {caVariation >= 0 ? '+' : ''}{caVariation.toFixed(1)}%
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-2 truncate" title={`${ventesFiltrees.length} transactions sur la période`}>
            {ventesFiltrees.length} transaction{ventesFiltrees.length > 1 ? 's' : ''}
            {totalRetours > 0 && <span className="text-rose-500 font-semibold"> · {formatCfa(totalRetours)} retourné</span>}
          </p>
        </GlassCard>

        {/* Card 2: Panier Moyen */}
        <GlassCard hoverEffect className="min-w-0 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
              Panier Moyen
            </span>
            <div className="p-2 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 shrink-0">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight whitespace-nowrap" title={formatCfa(panierMoyen)}>
            {formatCfa(panierMoyen)}
          </div>
          <p className="text-[11px] text-slate-400 mt-2 truncate">Moyenne par vente</p>
        </GlassCard>

        {/* Card 3: Bénéfice (Admin) */}
        {personnel?.role === 'admin' && (
          <GlassCard hoverEffect className={`min-w-0 p-4 sm:p-5 ${benefice >= 0 ? 'border-emerald-500/30' : 'border-rose-500/30'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
                Bénéfice Net
              </span>
              <div className={`p-2 rounded-xl shrink-0 ${benefice >= 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'}`}>
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className={`mt-3 text-xl sm:text-2xl font-black tracking-tight whitespace-nowrap ${benefice >= 0 ? 'text-emerald-600' : 'text-rose-600'}`} title={formatCfa(benefice)}>
              {formatCfa(benefice)}
            </div>
            <p className="text-[11px] text-slate-400 mt-2 truncate">Marge : {tauxMarge.toFixed(1)}%</p>
          </GlassCard>
        )}

        {/* Card 4: Créances Clients (Sécurisée contre le débordement) */}
        <GlassCard
          hoverEffect
          className={`relative min-w-0 overflow-hidden p-4 sm:p-5 ${
            totalCreances > 0
              ? 'border-rose-500/40 bg-gradient-to-br from-rose-500/5 to-transparent'
              : ''
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-600 dark:text-rose-400 truncate" title="Créances en Attente">
              Créances Dues
            </span>
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 shrink-0">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-2 min-w-0 flex-wrap">
            <div className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400 tracking-tight whitespace-nowrap" title={formatCfa(totalCreances)}>
              {formatCfa(totalCreances)}
            </div>
            {totalCreances > 0 && (
              <Badge variant="red" size="sm" className="shrink-0 whitespace-nowrap text-[10px] px-1.5 py-0.5">
                À recouvrer
              </Badge>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between gap-1 text-[11px] text-slate-400 min-w-0">
            <span className="truncate">Dettes clients</span>
            <button
              onClick={() => onNavigate('clients')}
              className="text-blue-500 font-semibold hover:underline flex items-center gap-0.5 shrink-0 whitespace-nowrap"
            >
              Clients <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        </GlassCard>

        {/* Card 5: Stock Total */}
        <GlassCard hoverEffect className="min-w-0 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
              Stock Total
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-2 min-w-0">
            <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight whitespace-nowrap">
              {totalStockItems}
            </div>
            <Badge variant="green" size="sm" className="shrink-0 whitespace-nowrap text-[10px] px-1.5 py-0.5">
              {produits.length} réf.
            </Badge>
          </div>
          <p className="text-[11px] text-slate-400 mt-2 truncate">Unités en rayon</p>
        </GlassCard>

        {/* Card 6: Alertes Stock Bas */}
        <GlassCard hoverEffect className={`min-w-0 p-4 sm:p-5 ${stockBasItems.length > 0 ? 'border-amber-500/40' : ''}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400 truncate">
              Stock Critique
            </span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-2 min-w-0">
            <div className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 tracking-tight whitespace-nowrap">
              {stockBasItems.length}
            </div>
            {stockBasItems.length > 0 && (
              <Badge variant="amber" size="sm" className="shrink-0 whitespace-nowrap text-[10px] px-1.5 py-0.5">
                Alerte
              </Badge>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between gap-1 text-[11px] text-slate-400 min-w-0">
            <span className="truncate">Sous le seuil</span>
            <button
              onClick={() => onNavigate('stock')}
              className="text-blue-500 font-semibold hover:underline flex items-center gap-0.5 shrink-0 whitespace-nowrap"
            >
              Commander <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        </GlassCard>
      </div>

      {/* SECTION VENTES PAR VENDEUR ENRICHIE */}
      <GlassCard className="min-w-0 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200/50 dark:border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Ventes par vendeur</h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Performance individuelle, chiffre d'affaires et volume de ventes par membre de l'équipe.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {/* Recherche rapide vendeur */}
            <div className="relative min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={sellerSearch}
                onChange={(e) => setSellerSearch(e.target.value)}
                placeholder="Filtrer un vendeur..."
                className="w-full glass-input pl-9 pr-3 py-2 rounded-xl text-xs text-slate-900 dark:text-white"
              />
              {sellerSearch && (
                <button
                  onClick={() => setSellerSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Sélecteur de tri */}
            <div className="flex items-center gap-1.5 bg-slate-100/80 dark:bg-slate-800/80 px-2.5 py-1.5 rounded-xl border border-slate-200/60 dark:border-white/10 text-xs">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                value={sellerSort}
                onChange={(e) => setSellerSort(e.target.value as any)}
                className="bg-transparent font-medium text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="ca-desc">CA décroissant (Top)</option>
                <option value="ca-asc">CA croissant</option>
                <option value="ventes-desc">Nombre de ventes</option>
                <option value="nom-asc">Nom (A - Z)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Grille des cartes vendeurs */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredVentesParVendeur.length === 0 ? (
            <div className="col-span-full py-10 text-center">
              <Users className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                Aucun vendeur trouvé
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {sellerSearch ? 'Aucun vendeur ne correspond à votre recherche.' : 'Aucune vente enregistrée sur cette période.'}
              </p>
            </div>
          ) : (
            filteredVentesParVendeur.map((vendeur, idx) => {
              const caShare = totalCA > 0 ? (vendeur.total / totalCA) * 100 : 0;
              const sellerPanierMoyen = vendeur.count > 0 ? vendeur.total / vendeur.count : 0;

              return (
                <div
                  key={vendeur.nom}
                  className="group relative rounded-2xl bg-slate-50/80 dark:bg-slate-900/40 p-4 border border-slate-200/60 dark:border-white/10 hover:border-blue-500/40 hover:shadow-lg transition-all duration-300 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30 flex items-center justify-center font-black text-sm text-blue-600 dark:text-blue-400 shrink-0">
                          {vendeur.nom.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
                            {vendeur.nom}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">
                            {vendeur.identifiant ? `ID: ${vendeur.identifiant}` : `${vendeur.count} transaction(s)`}
                          </div>
                        </div>
                      </div>

                      {/* Badge de Rang Top 3 */}
                      {idx === 0 && (
                        <Badge variant="amber" size="sm">
                          1er
                        </Badge>
                      )}
                      {idx === 1 && (
                        <Badge variant="purple" size="sm">
                           2ème
                        </Badge>
                      )}
                      {idx === 2 && (
                        <Badge variant="blue" size="sm">
                           3ème
                        </Badge>
                      )}
                    </div>

                    {/* Chiffre d'Affaires & Part */}
                    <div className="space-y-1 my-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-2xl font-black text-blue-600 dark:text-blue-400 tracking-tight">
                          {formatCfa(vendeur.total)}
                        </span>
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {caShare.toFixed(1)}% du CA
                        </span>
                      </div>

                      {/* Barre de part de CA */}
                      <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700/60 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(5, caShare))}%` }}
                        />
                      </div>
                    </div>

                    {/* Statistiques clés */}
                    <div className="grid grid-cols-2 gap-2 py-2 border-t border-slate-200/50 dark:border-white/10 text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Ventes</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {vendeur.count} transaction{vendeur.count > 1 ? 's' : ''}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Panier moyen</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {formatCfa(sellerPanierMoyen)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Bouton d'action */}
                  <button
                    onClick={() => handleOpenSellerDetail(vendeur.nom)}
                    className="mt-3 w-full py-2 px-3 rounded-xl bg-blue-500/10 hover:bg-blue-500 text-blue-600 hover:text-white dark:text-blue-400 dark:hover:text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Explorer les ventes de ce vendeur
                    <ChevronRight className="w-3.5 h-3.5 ml-auto" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </GlassCard>

      {/* MODALE DÉTAILLÉE DES VENTES DU VENDEUR AVEC FILTRES AVANCÉS */}
      {sellerDetailName && (
        <Modal
          isOpen={!!sellerDetailName}
          onClose={() => setSellerDetailName(null)}
          title={`Analyse & Ventes de ${sellerDetailName}`}
          maxWidth="xl"
        >
          <div className="space-y-4">
            {/* Header avec action Export */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/50 dark:border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-black text-white text-base shadow-md shadow-blue-500/20">
                  {sellerDetailName.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900 dark:text-white">
                    {sellerDetailName}
                  </h4>
                  <p className="text-xs text-slate-400">
                    {ventesDuVendeurFiltrees.length} vente(s) correspondant aux critères
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="glass"
                  size="sm"
                  icon={<FileSpreadsheet className="w-4 h-4 text-emerald-500" />}
                  onClick={handleExportSellerSalesCSV}
                  disabled={ventesDuVendeurFiltrees.length === 0}
                >
                  Exporter CSV
                </Button>
              </div>
            </div>

            {/* 4 Mini-KPIs en direct basés sur les filtres appliqués */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 block">
                  Chiffre d'Affaires
                </span>
                <span className="text-base font-black text-slate-900 dark:text-white block mt-0.5 truncate">
                  {formatCfa(sellerModalStats.totalCa)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
                <span className="text-[10px] uppercase font-bold text-purple-600 dark:text-purple-400 block">
                  Tickets / Ventes
                </span>
                <span className="text-base font-black text-slate-900 dark:text-white block mt-0.5">
                  {sellerModalStats.countSales}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">
                  Panier Moyen
                </span>
                <span className="text-base font-black text-slate-900 dark:text-white block mt-0.5 truncate">
                  {formatCfa(sellerModalStats.panierMoyen)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <span className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400 block">
                  Articles Vendus
                </span>
                <span className="text-base font-black text-slate-900 dark:text-white block mt-0.5">
                  {sellerModalStats.totalItems} pcs
                </span>
              </div>
            </div>

            {/* BARRE DE FILTRES AVANCÉE DU VENDEUR */}
            <div className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/60 dark:border-white/10 space-y-3">
              {/* Ligne 1 : Recherche & Tri */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={sellerModalSearch}
                    onChange={(e) => {
                      setSellerModalSearch(e.target.value);
                      setSellerModalPage(1);
                    }}
                    placeholder="Rechercher produit, variante, client ou réf ticket..."
                    className="w-full glass-input pl-9 pr-3 py-2 rounded-xl text-xs text-slate-900 dark:text-white"
                  />
                  {sellerModalSearch && (
                    <button
                      onClick={() => setSellerModalSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-3 py-2 rounded-xl border border-slate-200/60 dark:border-white/10 text-xs">
                  <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <select
                    value={sellerModalSort}
                    onChange={(e) => {
                      setSellerModalSort(e.target.value as any);
                      setSellerModalPage(1);
                    }}
                    className="bg-transparent font-medium text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
                  >
                    <option value="date-desc">Plus récent d'abord</option>
                    <option value="date-asc">Plus ancien d'abord</option>
                    <option value="total-desc">Montant le plus élevé</option>
                    <option value="total-asc">Montant le plus faible</option>
                  </select>
                </div>
              </div>

              {/* Ligne 2 : Filtres Dates & Statuts */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {/* Période / Presets */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">
                    Période de vente
                  </label>
                  <select
                    value={sellerModalDatePreset}
                    onChange={(e) => {
                      setSellerModalDatePreset(e.target.value as any);
                      setSellerModalPage(1);
                    }}
                    className="w-full glass-input px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-900 dark:text-white"
                  >
                    <option value="all">Toutes les dates</option>
                    <option value="today">Aujourd'hui</option>
                    <option value="7d">7 derniers jours</option>
                    <option value="30d">30 derniers jours</option>
                    <option value="this_month">Ce mois-ci</option>
                    <option value="custom">📅 Plage de dates personnalisée...</option>
                  </select>
                </div>

                {/* Mode de paiement */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">
                    Mode de paiement
                  </label>
                  <select
                    value={sellerModalPayment}
                    onChange={(e) => {
                      setSellerModalPayment(e.target.value as any);
                      setSellerModalPage(1);
                    }}
                    className="w-full glass-input px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-900 dark:text-white"
                  >
                    <option value="all">Tous les paiements</option>
                    <option value="especes">Espèces</option>
                    <option value="mobile_money">Mobile money</option>
                    <option value="virement">Virement</option>
                  </select>
                </div>

                {/* Statut vente */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">
                    Statut de la vente
                  </label>
                  <select
                    value={sellerModalStatus}
                    onChange={(e) => {
                      setSellerModalStatus(e.target.value as any);
                      setSellerModalPage(1);
                    }}
                    className="w-full glass-input px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-900 dark:text-white"
                  >
                    <option value="all">Tous les statuts</option>
                    <option value="paye">✅ Payé intégralement</option>
                    <option value="partiel">⏳ Paiement partiel</option>
                    <option value="credit">⚠️ À crédit (Dette)</option>
                  </select>
                </div>
              </div>

              {/* Plage personnalisée si sélectionnée */}
              {sellerModalDatePreset === 'custom' && (
                <div className="pt-2 border-t border-slate-200/50 dark:border-white/10 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    Dates personnalisées :
                  </span>
                  <DateRangePicker
                    startDate={sellerModalDateDebut}
                    endDate={sellerModalDateFin}
                    align="left"
                    onChange={(start, end) => {
                      setSellerModalDateDebut(start);
                      setSellerModalDateFin(end);
                      setSellerModalPage(1);
                    }}
                  />
                </div>
              )}

              {/* Bouton reset si filtres appliqués */}
              {(sellerModalSearch || sellerModalDatePreset !== 'all' || sellerModalPayment !== 'all' || sellerModalStatus !== 'all') && (
                <div className="flex justify-end pt-1">
                  <button
                    onClick={resetSellerModalFilters}
                    className="text-xs text-rose-500 hover:text-rose-600 font-bold flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Réinitialiser tous les filtres
                  </button>
                </div>
              )}
            </div>

            {/* LISTE DES VENTES DU VENDEUR */}
            <div className="max-h-[50vh] overflow-y-auto space-y-2.5 pr-1">
              {paginatedSellerSales.length === 0 ? (
                <div className="py-12 text-center">
                  <Receipt className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                    Aucune vente trouvée avec ces critères
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Essayez de modifier votre recherche ou d'élargir la période.
                  </p>
                </div>
              ) : (
                paginatedSellerSales.map((vente) => {
                  const lines = lignesParVente(vente.id);
                  const totalItemsInSale = lines.reduce((s, l) => s + (l.quantite || 0), 0);

                  return (
                    <div
                      key={vente.id}
                      className="p-3.5 rounded-2xl border border-slate-200/60 dark:border-white/10 bg-slate-50/70 dark:bg-slate-900/40 hover:border-blue-500/30 transition-all space-y-2.5"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-black text-slate-900 dark:text-white">
                            {new Date(vente.date).toLocaleString('fr-FR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          <span className="text-xs text-slate-400">·</span>
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Client : <strong className="text-slate-900 dark:text-white">{vente.client_nom || 'Client Passant'}</strong>
                          </span>
                          <span className="text-xs text-slate-400">·</span>
                          <Badge
                            variant={
                              vente.methode_paiement === 'especes'
                                ? 'green'
                                : vente.methode_paiement === 'mobile_money'
                                ? 'purple'
                                : 'blue'
                            }
                            size="sm"
                          >
                            {vente.methode_paiement === 'especes'
                              ? 'Espèces'
                              : vente.methode_paiement === 'mobile_money'
                              ? 'Mobile money'
                              : 'Virement'}
                          </Badge>
                          <Badge
                            variant={
                              vente.statut === 'paye'
                                ? 'green'
                                : vente.statut === 'partiel'
                                ? 'amber'
                                : 'red'
                            }
                            size="sm"
                          >
                            {vente.statut === 'paye'
                              ? 'Payé'
                              : vente.statut === 'partiel'
                              ? 'Partiel'
                              : 'À crédit'}
                          </Badge>
                        </div>

                        <div className="text-right">
                          <span className="text-base font-black text-blue-600 dark:text-blue-400">
                            {formatCfa(vente.total)}
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            {totalItemsInSale} article{totalItemsInSale > 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>

                      {/* Détail des lignes */}
                      <div className="pt-2 border-t border-slate-200/50 dark:border-white/5 space-y-1">
                        {lines.map((ligne) => (
                          <div
                            key={ligne.id}
                            className="flex justify-between items-center text-xs text-slate-600 dark:text-slate-300 bg-white/50 dark:bg-slate-800/40 px-2.5 py-1.5 rounded-lg"
                          >
                            <span className="truncate pr-2">
                              <strong className="text-slate-900 dark:text-white">{ligne.produit_nom}</strong>
                              {ligne.variante ? ` (${ligne.variante})` : ''}
                              <span className="text-slate-400"> × {ligne.quantite}</span>
                            </span>
                            <span className="font-semibold text-slate-900 dark:text-white shrink-0">
                              {formatCfa(ligne.prix_unitaire * ligne.quantite)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* PAGINATION DE LA MODALE */}
            {totalSellerModalPages > 1 && (
              <div className="flex items-center justify-between pt-3 border-t border-slate-200/50 dark:border-white/10 text-xs">
                <span className="text-slate-400">
                  Page <strong className="text-slate-900 dark:text-white">{sellerModalPage}</strong> sur{' '}
                  <strong className="text-slate-900 dark:text-white">{totalSellerModalPages}</strong> ({ventesDuVendeurFiltrees.length} ventes)
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="glass"
                    size="sm"
                    disabled={sellerModalPage <= 1}
                    onClick={() => setSellerModalPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Précédent
                  </Button>
                  <Button
                    variant="glass"
                    size="sm"
                    disabled={sellerModalPage >= totalSellerModalPages}
                    onClick={() => setSellerModalPage((p) => Math.min(totalSellerModalPages, p + 1))}
                  >
                    Suivant
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
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
                tickFormatter={(v) => formatCfaCompact(Number(v))}
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

      {/* NOUVELLE SECTION: Palmarès & Performances */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Award className="w-5 h-5 text-amber-500" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white"> Performances</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          
          {/* Top Clients */}
          <GlassCard className="flex flex-col">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200/50 dark:border-white/10">
              <Star className="w-4 h-4 text-blue-500" />
              <h4 className="font-bold text-slate-900 dark:text-white text-sm">Meilleurs clients</h4>
            </div>
            <div className="space-y-3 flex-1">
              {topClients.length === 0 ? <p className="text-xs text-slate-400">Aucune donnée</p> : 
                topClients.map((c, i) => (
                  <div key={c.nom} className="flex justify-between items-center text-sm">
                    <span className="truncate flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-[10px] shrink-0 font-bold bg-slate-100 dark:bg-slate-800 w-5 h-5 flex items-center justify-center rounded-full">{i + 1}</span>
                      <span className="truncate">{c.nom}</span>
                    </span>
                    <span className="font-bold text-blue-600 shrink-0">{formatCfa(c.total)}</span>
                  </div>
                ))
              }
            </div>
          </GlassCard>

          {/* Top Produits (Quantité) */}
          <GlassCard className="flex flex-col">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200/50 dark:border-white/10">
              <Package className="w-4 h-4 text-emerald-500" />
              <h4 className="font-bold text-slate-900 dark:text-white text-sm">Top Produits (Vendus)</h4>
            </div>
            <div className="space-y-3 flex-1">
              {topProduits.byQte.length === 0 ? <p className="text-xs text-slate-400">Aucune donnée</p> : 
                topProduits.byQte.map((p, i) => (
                  <div key={p.nom} className="flex justify-between items-center text-sm">
                    <span className="truncate flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-[10px] shrink-0 font-bold bg-slate-100 dark:bg-slate-800 w-5 h-5 flex items-center justify-center rounded-full">{i + 1}</span>
                      <span className="truncate">{p.nom}</span>
                    </span>
                    <span className="font-bold text-emerald-600 shrink-0">{p.qte} <span className="text-[10px] font-normal text-slate-400">unit.</span></span>
                  </div>
                ))
              }
            </div>
          </GlassCard>

          {/* Top Produits (Bénéfice) - Only Admin */}
          {personnel?.role === 'admin' ? (
            <GlassCard className="flex flex-col">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200/50 dark:border-white/10">
                <TrendingUp className="w-4 h-4 text-violet-500" />
                <h4 className="font-bold text-slate-900 dark:text-white text-sm">Top Produits (Rentables)</h4>
              </div>
              <div className="space-y-3 flex-1">
                {topProduits.byBenefice.length === 0 ? <p className="text-xs text-slate-400">Aucune donnée</p> : 
                  topProduits.byBenefice.map((p, i) => (
                    <div key={p.nom} className="flex justify-between items-center text-sm">
                      <span className="truncate flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-[10px] shrink-0 font-bold bg-slate-100 dark:bg-slate-800 w-5 h-5 flex items-center justify-center rounded-full">{i + 1}</span>
                        <span className="truncate">{p.nom}</span>
                      </span>
                      <span className="font-bold text-violet-600 shrink-0">{formatCfa(p.benefice)}</span>
                    </div>
                  ))
                }
              </div>
            </GlassCard>
          ) : (
            <GlassCard className="flex flex-col justify-center items-center opacity-50 bg-slate-100/30 dark:bg-slate-800/20">
              <TrendingUp className="w-6 h-6 text-slate-400 mb-2" />
              <p className="text-xs text-slate-400 text-center px-4">Statistiques de rentabilité réservées aux administrateurs.</p>
            </GlassCard>
          )}

          {/* Top Boutiques */}
          <GlassCard className="flex flex-col">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200/50 dark:border-white/10">
              <Store className="w-4 h-4 text-rose-500" />
              <h4 className="font-bold text-slate-900 dark:text-white text-sm">Top Boutiques</h4>
            </div>
            <div className="space-y-3 flex-1">
              {topZones.length === 0 ? <p className="text-xs text-slate-400">Aucune donnée</p> : 
                topZones.map((z, i) => (
                  <div key={z.nom} className="flex justify-between items-center text-sm">
                    <span className="truncate flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-[10px] shrink-0 font-bold bg-slate-100 dark:bg-slate-800 w-5 h-5 flex items-center justify-center rounded-full">{i + 1}</span>
                      <span className="truncate">{z.nom}</span>
                    </span>
                    <span className="font-bold text-rose-600 shrink-0">{formatCfa(z.ca)}</span>
                  </div>
                ))
              }
            </div>
          </GlassCard>

        </div>
      </div>

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
                    className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-100/50 dark:bg-slate-800/40 border border-slate-200/40 dark:border-white/5 min-w-0"
                  >
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {client.nom}
                      </h4>
                      <p className="text-xs text-slate-400 truncate">{client.telephone}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-black text-rose-600 dark:text-rose-400 whitespace-nowrap">
                        {formatCfa(client.total_dette)}
                      </div>
                      <Badge variant="red" size="sm" className="mt-0.5 shrink-0 whitespace-nowrap text-[10px] px-1.5 py-0.2">
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

      {/* MODAL EXPORT */}
      <Modal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} title="Exportation Avancée (CSV)">
        <div className="space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Sélectionnez les données que vous souhaitez télécharger. Un fichier séparé sera téléchargé pour chaque sélection.
          </p>
          <div className="space-y-3 p-4 rounded-2xl border border-slate-200/50 dark:border-white/10 bg-slate-50/50 dark:bg-slate-800/20">
            <label className="flex items-start gap-3 cursor-pointer">
              <input 
                type="checkbox" 
                checked={exportOptions.ventes} 
                onChange={(e) => setExportOptions({...exportOptions, ventes: e.target.checked})} 
                className="mt-1 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
              />
              <div>
                <div className="font-bold text-slate-900 dark:text-white">Ventes détaillées</div>
                <div className="text-xs text-slate-500">Exporte toutes les ventes de la période filtrée ({dateDebut} au {dateFin}) avec le détail des articles vendus.</div>
              </div>
            </label>
            
            <label className="flex items-start gap-3 cursor-pointer">
              <input 
                type="checkbox" 
                checked={exportOptions.clients} 
                onChange={(e) => setExportOptions({...exportOptions, clients: e.target.checked})} 
                className="mt-1 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
              />
              <div>
                <div className="font-bold text-slate-900 dark:text-white">Répertoire Clients</div>
                <div className="text-xs text-slate-500">Exporte la liste complète de vos clients avec leurs dettes et coordonnées.</div>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input 
                type="checkbox" 
                checked={exportOptions.stock} 
                onChange={(e) => setExportOptions({...exportOptions, stock: e.target.checked})} 
                className="mt-1 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
              />
              <div>
                <div className="font-bold text-slate-900 dark:text-white">État des Stocks</div>
                <div className="text-xs text-slate-500">Exporte l'inventaire actuel des produits (stock disponible, prix de vente, etc.).</div>
              </div>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200/50 dark:border-white/10">
            <Button variant="ghost" onClick={() => setIsExportModalOpen(false)}>Annuler</Button>
            <Button 
              variant="primary" 
              icon={<Download className="w-4 h-4" />} 
              onClick={handleExport}
              disabled={!exportOptions.ventes && !exportOptions.clients && !exportOptions.stock}
            >
              Générer les Exports
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
