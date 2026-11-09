import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Package,
  Plus,
  Search,
  Edit2,
  Trash2,
  Barcode,
  Truck,
  AlertTriangle,
  Layers,
  X,
  Lock,
  Scale,
  Filter,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  ArrowUpDown,
  Boxes,
  AlertOctagon,
  CheckCircle2,
  Box,
  Save,
  Camera,
  Printer,
  RefreshCw,
  Info,
} from 'lucide-react';
import type {
  Produit,
  AttributProduit,
  VarianteProduit,
  AchatStock,
  AjustementStock,
  Fournisseur,
  Zone,
  Categorie,
  AppSettings,
} from '../db/db';
import { apiGet, apiPost, apiPut, apiDelete, ApiError } from '../services/api';
import { GlassCard } from '../components/ui/GlassCard';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';

import { useDialog } from '../components/ui/DialogProvider';
import { formatCfa } from '../utils/currency';
import { BarcodePrintModal } from '../components/BarcodePrintModal';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';

import { generateRandomBarcode } from '../utils/barcode';
import { PageSkeleton } from '../components/ui/Skeleton';
import { AchatsTab } from './stock/AchatsTab';
import { AjustementsTab } from './stock/AjustementsTab';
import { RestockModal, type StockModalRequest } from './stock/RestockModal';
import { AdjustmentModal } from './stock/AdjustmentModal';

interface StockProps {
  activeZoneId: number | null;
}

export const Stock: React.FC<StockProps> = ({ activeZoneId }) => {
  const { confirm, alert } = useDialog();
  const [produits, setProduits] = useState<Produit[]>([]);
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [categoriesDb, setCategoriesDb] = useState<Categorie[]>([]);
  const [achats, setAchats] = useState<AchatStock[]>([]);
  const [ajustements, setAjustements] = useState<AjustementStock[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [p, f, z, cat, a, aj, s] = await Promise.all([
        apiGet<Produit[]>('/produits'),
        apiGet<Fournisseur[]>('/fournisseurs'),
        apiGet<Zone[]>('/zones'),
        apiGet<Categorie[]>('/categories'),
        apiGet<AchatStock[]>('/achats-stock'),
        apiGet<AjustementStock[]>('/ajustements-stock'),
        apiGet<AppSettings>('/settings'),
      ]);
      setProduits(p);
      setFournisseurs(f);
      setZones(z);
      setCategoriesDb([...cat].sort((x, y) => x.nom.localeCompare(y.nom)));
      setAchats([...a].sort((x, y) => y.date.localeCompare(x.date)));
      setAjustements([...aj].sort((x, y) => y.date.localeCompare(x.date)));
      setSettings(s);
    } catch (err) {
      await alert(err instanceof ApiError ? err.message : 'Impossible de charger le stock.');
    } finally {
      setDataLoading(false);
    }
  }, [alert]);

  useEffect(() => {
    reload();
  }, [reload]);

  const [activeTab, setActiveTab] = useState<'produits' | 'achats' | 'ajustements'>('produits');
  
  // Tab 1: Produits Filter & Pagination State
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Tous');
  const [supplierFilter, setSupplierFilter] = useState<number | 'Tous'>('Tous');
  const [statusFilter, setStatusFilter] = useState<'all' | 'rupture' | 'low' | 'normal' | 'variable' | 'simple'>('all');
  const [sortBy, setSortBy] = useState<'nom-asc' | 'nom-desc' | 'stock-asc' | 'stock-desc' | 'prix-asc' | 'prix-desc'>('nom-asc');
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Modal State for Add / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduit, setEditingProduit] = useState<Produit | null>(null);

  // Form State
  const [nom, setNom] = useState('');
  const [isVariable, setIsVariable] = useState(false);
  const [prix, setPrix] = useState('');
  const [coutAchat, setCoutAchat] = useState('');
  const [stock, setStock] = useState('');
  const [codeBarres, setCodeBarres] = useState('');
  const [categorie, setCategorie] = useState('Smartphones');
  const [variantes, setVariantes] = useState('');
  const [minStock, setMinStock] = useState('5');
  const [productZoneId, setProductZoneId] = useState<number | ''>('');
  const [productFournisseurId, setProductFournisseurId] = useState<number | ''>('');

  // Variable product attribute builder state
  const [attributs, setAttributs] = useState<AttributProduit[]>([
    { nom: 'Couleur', valeurs: ['Noir Sidéral', 'Titane Naturel'] },
    { nom: 'Capacité', valeurs: ['128 Go', '256 Go'] },
  ]);
  const [attrRawInputs, setAttrRawInputs] = useState<Record<number, string>>({});
  const [variantesDetaillees, setVariantesDetaillees] = useState<VarianteProduit[]>([]);
  
  // Modales réapprovisionnement / ajustement : null = fermée.
  const [restockRequest, setRestockRequest] = useState<StockModalRequest | null>(null);
  const [adjustRequest, setAdjustRequest] = useState<StockModalRequest | null>(null);

  // Single Variant Add Form inside modal
  const [newVariantAttrs, setNewVariantAttrs] = useState<Record<string, string>>({});
  const [newVariantPrix, setNewVariantPrix] = useState<string>('');
  const [newVariantCoutAchat, setNewVariantCoutAchat] = useState<string>('');
  const [newVariantStock, setNewVariantStock] = useState<string>('5');
  const [newVariantCodeBarres, setNewVariantCodeBarres] = useState<string>('');
  const [bulkPriceValue, setBulkPriceValue] = useState<string>('');

  // Barcode Printing & Scanning States
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [barcodePrintProduit, setBarcodePrintProduit] = useState<Produit | null>(null);
  const [isBarcodePrintModalOpen, setIsBarcodePrintModalOpen] = useState(false);
  const [isStockScannerOpen, setIsStockScannerOpen] = useState(false);
  const [scanningVariantTarget, setScanningVariantTarget] = useState<'main' | 'newVariant' | string | null>(null);

  // Categories
  const categories: string[] = useMemo(() => {
    const listFromDb = categoriesDb.map((c) => c.nom);
    const set = new Set<string>([...listFromDb, ...produits.map((p) => p.categorie)]);
    return Array.from(set).filter(Boolean);
  }, [categoriesDb, produits]);

  const handleStockBarcodeScan = (scannedCode: string) => {
    const code = scannedCode.trim();
    if (!code) return;
    if (scanningVariantTarget === 'main') {
      setCodeBarres(code);
    } else if (scanningVariantTarget === 'newVariant') {
      setNewVariantCodeBarres(code);
    } else if (scanningVariantTarget) {
      setVariantesDetaillees((prev) =>
        prev.map((v) => (v.id === scanningVariantTarget ? { ...v, code_barres: code } : v))
      );
    } else {
      setSearch(code);
    }
    setIsStockScannerOpen(false);
    setScanningVariantTarget(null);
  };

  const openCreateModal = () => {
    setEditingProduit(null);
    setNom('');
    setIsVariable(false);
    setPrix('');
    setCoutAchat('');
    setStock('0');
    setCodeBarres('');
    setCategorie(categories[0] || 'Smartphones');
    setVariantes('');
    setMinStock('5');
    setProductZoneId(activeZoneId ?? (zones.length > 0 ? zones[0].id ?? '' : ''));
    setProductFournisseurId(fournisseurs.length > 0 ? fournisseurs[0].id ?? '' : '');
    const defaultAttrs: AttributProduit[] = [
      { nom: 'Couleur', valeurs: ['Noir Sidéral', 'Titane Naturel'] },
      { nom: 'Capacité', valeurs: ['128 Go', '256 Go'] },
    ];
    setAttributs(defaultAttrs);
    setAttrRawInputs({
      0: defaultAttrs[0].valeurs.join(', '),
      1: defaultAttrs[1].valeurs.join(', '),
    });
    setVariantesDetaillees([]);
    setNewVariantAttrs({});
    setNewVariantPrix('');
    setNewVariantStock('5');
    setBulkPriceValue('');
    setIsModalOpen(true);
  };

  const openEditModal = (p: Produit) => {
    setEditingProduit(p);
    setNom(p.nom);
    setIsVariable(Boolean(p.is_variable));
    setPrix(p.prix.toString());
    setCoutAchat(p.cout_achat_unitaire != null ? p.cout_achat_unitaire.toString() : '');
    setStock(p.stock.toString());
    setCodeBarres(p.code_barres);
    setCategorie(p.categorie);
    setVariantes((p.variantes || []).join(', '));
    setMinStock(p.min_stock.toString());
    setProductZoneId(p.zone_id ?? activeZoneId ?? (zones.length > 0 ? zones[0].id ?? '' : ''));
    setProductFournisseurId(p.fournisseur_id ?? (fournisseurs.length > 0 ? fournisseurs[0].id ?? '' : ''));

    if (p.is_variable) {
      const loadedAttrs =
        p.attributs && p.attributs.length > 0
          ? p.attributs
          : [
              { nom: 'Couleur', valeurs: ['Noir Sidéral', 'Titane Naturel'] },
              { nom: 'Capacité', valeurs: ['128 Go', '256 Go'] },
            ];
      setAttributs(loadedAttrs);
      const rawMap: Record<number, string> = {};
      loadedAttrs.forEach((a, i) => {
        rawMap[i] = (a.valeurs || []).join(', ');
      });
      setAttrRawInputs(rawMap);
      setVariantesDetaillees(p.variantes_detaillees || []);
    } else {
      setAttributs([]);
      setAttrRawInputs({});
      setVariantesDetaillees([]);
    }

    setNewVariantAttrs({});
    setNewVariantPrix(p.prix ? p.prix.toString() : '');
    setNewVariantStock('5');
    setBulkPriceValue('');
    setIsModalOpen(true);
  };

  const handleOpenAddModal = openCreateModal;
  const handleOpenEditModal = openEditModal;

  const handleOpenRestockModal = (p?: Produit, variantId?: string) => setRestockRequest({ produit: p, variantId });

  const handleOpenAjustementModal = (p?: Produit, variantId?: string) => setAdjustRequest({ produit: p, variantId });

  // Helper to add a single variant explicitly with its custom price and stock
  const handleAddSingleVariant = () => {
    const validAttrs = attributs.filter((a) => a.nom.trim());
    if (validAttrs.length === 0) {
      alert({
        title: 'Attribut requis',
        message: 'Veuillez configurer au moins un type d\'attribut (ex: Couleur, Capacité) avant d\'ajouter une variante.',
      });
      return;
    }

    const record: Record<string, string> = {};
    for (const attr of validAttrs) {
      const val = (newVariantAttrs[attr.nom] || '').trim();
      if (!val) {
        alert({
          title: 'Valeur manquante',
          message: `Veuillez spécifier une valeur pour l'attribut "${attr.nom}".`,
        });
        return;
      }
      record[attr.nom] = val;
    }

    // Check if variant already exists
    const exists = variantesDetaillees.some((v) =>
      validAttrs.every((attr) => v.attributs && v.attributs[attr.nom] === record[attr.nom])
    );

    if (exists) {
      alert({
        title: 'Variante déjà existante',
        message: 'Cette combinaison de variante existe déjà dans la liste. Vous pouvez directement modifier son prix de vente dans le tableau des variantes existantes.',
      });
      return;
    }

    const customPrice = parseFloat(newVariantPrix) || parseFloat(prix) || 0;
    const customCost = parseFloat(newVariantCoutAchat) || undefined;
    const initialStock = parseInt(newVariantStock, 10) || 0;

    const slug = Object.values(record).map((s) => s.toLowerCase().replace(/[^a-z0-9]/gi, '')).join('_');
    const varId = `var_${(nom || 'prod').toLowerCase().replace(/[^a-z0-9]/gi, '_')}_${slug}_${Date.now()}`;

    const newVar: VarianteProduit = {
      id: varId,
      attributs: record,
      prix: customPrice,
      stock: initialStock,
      code_barres: newVariantCodeBarres.trim() || generateRandomBarcode(),
      cout_achat_unitaire: customCost,
    };

    // Update attributs list to include new values if they weren't in the list
    const updatedAttributs = attributs.map((attr) => {
      const val = record[attr.nom];
      if (val && !attr.valeurs.includes(val)) {
        return { ...attr, valeurs: [...attr.valeurs, val] };
      }
      return attr;
    });
    setAttributs(updatedAttributs);

    setVariantesDetaillees((prev) => [...prev, newVar]);
    setNewVariantAttrs({});
    setNewVariantPrix('');
    setNewVariantCoutAchat('');
    setNewVariantCodeBarres('');
  };

  const handleDeleteSingleVariant = (varId: string) => {
    setVariantesDetaillees((prev) => prev.filter((v) => v.id !== varId));
  };

  const handleUpdateVariantAttr = (varId: string, attrName: string, value: string) => {
    setVariantesDetaillees((prev) =>
      prev.map((v) => {
        if (v.id !== varId) return v;
        return {
          ...v,
          attributs: {
            ...v.attributs,
            [attrName]: value,
          },
        };
      })
    );
  };

  const handleApplyBulkPrice = () => {
    const p = parseFloat(bulkPriceValue);
    if (!Number.isFinite(p) || p < 0) return;
    setVariantesDetaillees((prev) =>
      prev.map((v) => ({ ...v, prix: p }))
    );
    setBulkPriceValue('');
  };

  // Helper to generate Cartesian product of all attributes into variantesDetaillees
  const handleGenerateCombinations = () => {
    const validAttrs = attributs.filter((a) => a.nom.trim() && a.valeurs.length > 0);
    if (validAttrs.length === 0) return;

    const cartesian = (arrays: string[][]): string[][] => {
      return arrays.reduce(
        (acc, curr) => acc.flatMap((d) => curr.map((e) => [...d, e])),
        [[]] as string[][]
      );
    };

    const attrNames = validAttrs.map((a) => a.nom.trim());
    const attrValues = validAttrs.map((a) => a.valeurs);
    const combos = cartesian(attrValues);

    const baseP = parseFloat(prix) || parseFloat(newVariantPrix) || (editingProduit ? editingProduit.prix : 0);
    const defaultStock = Math.max(1, Math.floor((parseInt(stock, 10) || 12) / combos.length));

    const newVariants: VarianteProduit[] = combos.map((combo, idx) => {
      const record: Record<string, string> = {};
      attrNames.forEach((name, i) => {
        record[name] = combo[i];
      });

      const slug = combo.map((s) => s.toLowerCase().replace(/[^a-z0-9]/gi, '')).join('_');
      const varId = `var_${(nom || 'prod').toLowerCase().replace(/[^a-z0-9]/gi, '_')}_${slug}_${idx + 1}`;

      // 1. Chercher d'abord une correspondance exacte dans les variantes existantes
      const exactExisting = variantesDetaillees.find((v) =>
        attrNames.every((name) => v.attributs && v.attributs[name] === record[name])
      );
      if (exactExisting) return exactExisting;

      // 2. Chercher une variante partielle existante pour hériter prix et coût d'achat
      const partialExisting = variantesDetaillees.find((v) =>
        Object.entries(v.attributs).some(([k, val]) => record[k] === val)
      );

      return {
        id: varId,
        attributs: record,
        prix: partialExisting ? partialExisting.prix : baseP > 0 ? baseP : 0,
        stock: editingProduit ? (partialExisting ? partialExisting.stock : 0) : (partialExisting ? Math.max(1, Math.floor(partialExisting.stock / (attrValues[attrValues.length - 1]?.length || 1))) : defaultStock),
        code_barres: partialExisting?.code_barres || generateRandomBarcode(),
        cout_achat_unitaire: partialExisting?.cout_achat_unitaire,
      };
    });

    setVariantesDetaillees(newVariants);
  };

  const handleSaveProduit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nom || !productZoneId) return;

    const numericMinStock = parseInt(minStock, 10) || 5;
    const productVariantes = variantes
      .split(',')
      .map((variante) => variante.trim())
      .filter(Boolean);

    // Calcul du prix et du stock selon le mode
    let finalPrix = parseFloat(prix) || 0;
    let finalStock = parseInt(stock, 10) || 0;

    let finalAttributs: AttributProduit[] | undefined = undefined;
    let finalVariantesDetaillees: VarianteProduit[] | undefined = undefined;

    if (isVariable) {
      finalAttributs = attributs.filter((a) => a.nom.trim() && a.valeurs.length > 0);
      finalVariantesDetaillees = variantesDetaillees;

      if (variantesDetaillees.length > 0) {
        finalStock = variantesDetaillees.reduce((sum, v) => sum + (v.stock || 0), 0);
        finalPrix = variantesDetaillees[0].prix || finalPrix;
      }
    }

    const payload = {
      nom,
      is_variable: isVariable,
      prix: finalPrix,
      // Sans coût d'achat, une vente est comptée à 100% de bénéfice — c'est ce qui a été
      // signalé comme un bug : le champ était tout simplement absent du formulaire. Pour un
      // produit variable, le coût vit par variante (voir variantes_detaillees ci-dessous).
      cout_achat_unitaire: isVariable ? undefined : parseFloat(coutAchat) || undefined,
      stock: finalStock,
      code_barres: codeBarres,
      categorie,
      variantes: productVariantes,
      attributs: isVariable ? finalAttributs : undefined,
      variantes_detaillees: isVariable ? finalVariantesDetaillees : undefined,
      min_stock: numericMinStock,
      zone_id: Number(productZoneId),
      fournisseur_id: productFournisseurId ? Number(productFournisseurId) : undefined,
    };

    try {
      if (editingProduit?.id) {
        await apiPut(`/produits/${editingProduit.id}`, payload);
      } else {
        await apiPost('/produits', payload);
      }
      setIsModalOpen(false);
      await reload();
    } catch (err) {
      await alert(err instanceof ApiError ? err.message : "Échec de l'enregistrement du produit.");
    }
  };

  const handleDeleteProduit = async (id: number) => {
    const ok = await confirm({
      title: 'Supprimer le produit',
      message: 'Voulez-vous vraiment supprimer ce produit du catalogue ?',
      danger: true,
      confirmLabel: 'Supprimer',
    });
    if (!ok) return;
    try {
      await apiDelete(`/produits/${id}`);
      await reload();
    } catch (err) {
      await alert(err instanceof ApiError ? err.message : 'Échec de la suppression.');
    }
  };

  // Restock purchase

  // Scoped to active zone
  const zoneProduits = produits.filter((p) => activeZoneId === null || p.zone_id === activeZoneId);

  // Status Counts for Quick Filter Pills
  const countAll = zoneProduits.length;
  const countRupture = zoneProduits.filter((p) => p.stock <= 0).length;
  const countLow = zoneProduits.filter((p) => p.stock > 0 && p.stock <= p.min_stock).length;
  const countNormal = zoneProduits.filter((p) => p.stock > p.min_stock).length;
  const countVariable = zoneProduits.filter((p) => p.is_variable).length;
  const countSimple = zoneProduits.filter((p) => !p.is_variable).length;

  // Filtered & Sorted Products
  const filteredProduits = zoneProduits
    .filter((p) => {
      const matchSearch =
        p.nom.toLowerCase().includes(search.toLowerCase()) ||
        p.code_barres.toLowerCase().includes(search.toLowerCase()) ||
        p.categorie.toLowerCase().includes(search.toLowerCase());

      const matchCat = categoryFilter === 'Tous' || p.categorie === categoryFilter;
      const matchSupplier = supplierFilter === 'Tous' || p.fournisseur_id === Number(supplierFilter);

      let matchStatus = true;
      if (statusFilter === 'rupture') matchStatus = p.stock <= 0;
      else if (statusFilter === 'low') matchStatus = p.stock > 0 && p.stock <= p.min_stock;
      else if (statusFilter === 'normal') matchStatus = p.stock > p.min_stock;
      else if (statusFilter === 'variable') matchStatus = Boolean(p.is_variable);
      else if (statusFilter === 'simple') matchStatus = !p.is_variable;

      return matchSearch && matchCat && matchSupplier && matchStatus;
    })
    .sort((a, b) => {
      if (sortBy === 'nom-asc') return a.nom.localeCompare(b.nom);
      if (sortBy === 'nom-desc') return b.nom.localeCompare(a.nom);
      if (sortBy === 'stock-asc') return a.stock - b.stock;
      if (sortBy === 'stock-desc') return b.stock - a.stock;
      if (sortBy === 'prix-asc') return a.prix - b.prix;
      if (sortBy === 'prix-desc') return b.prix - a.prix;
      return 0;
    });

  const totalFiltered = filteredProduits.length;
  const effectivePageSize = pageSize === 9999 ? (totalFiltered || 1) : pageSize;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / effectivePageSize));
  const validCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);
  const startIndex = (validCurrentPage - 1) * effectivePageSize;
  const endIndex = Math.min(startIndex + effectivePageSize, totalFiltered);
  const paginatedProduits = filteredProduits.slice(startIndex, endIndex);

  const isFiltered =
    search !== '' ||
    categoryFilter !== 'Tous' ||
    supplierFilter !== 'Tous' ||
    statusFilter !== 'all' ||
    sortBy !== 'nom-asc';

  const resetAllFilters = () => {
    setSearch('');
    setCategoryFilter('Tous');
    setSupplierFilter('Tous');
    setStatusFilter('all');
    setSortBy('nom-asc');
    setCurrentPage(1);
  };

  if (dataLoading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Gestion du Stock & Produits
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Catalogue général, réapprovisionnements et historique des achats fournisseurs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Button
            variant="glass"
            icon={<Truck className="w-4 h-4" />}
            onClick={() => handleOpenRestockModal()}
          >
            Réapprovisionner
          </Button>
          <Button
            variant="primary"
            icon={<Plus className="w-4 h-4" />}
            onClick={handleOpenAddModal}
          >
            Nouveau produit
          </Button>
        </div>
      </div>

      {/* Tabs bar */}
      <div className="flex items-center gap-2 border-b border-slate-200/50 dark:border-white/10 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('produits')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'produits'
              ? 'bg-blue-600 text-white shadow-md'
              : 'glass-card text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Catalogue Produits ({produits.length})
        </button>
        <button
          onClick={() => setActiveTab('achats')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'achats'
              ? 'bg-blue-600 text-white shadow-md'
              : 'glass-card text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Historique Achats ({achats.length})
        </button>
        <button
          onClick={() => setActiveTab('ajustements')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'ajustements'
              ? 'bg-slate-600 text-white shadow-md'
              : 'glass-card text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Scale className="w-4 h-4" />
          <span>Journal Ajustements ({ajustements.length})</span>
        </button>
      </div>

      {activeTab === 'produits' && (
        <div className="space-y-4">
          {/* Quick Filter Pills (Status Badges) */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1 shrink-0 mr-1">
              <Filter className="w-3.5 h-3.5" /> Filtres Rapides :
            </span>
            <button
              onClick={() => { setStatusFilter('all'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 flex items-center gap-1.5 ${
                statusFilter === 'all'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                  : 'glass-card text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>Tous</span>
              <span className="text-xs px-1.5 py-0.2 rounded-md bg-black/10 dark:bg-white/20 font-semibold">
                {countAll}
              </span>
            </button>
            <button
              onClick={() => { setStatusFilter('rupture'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 flex items-center gap-1.5 ${
                statusFilter === 'rupture'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'glass-card text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30'
              }`}
            >
              <AlertOctagon className="w-3.5 h-3.5 text-rose-500" />
              <span>Ruptures</span>
              <span className="text-xs px-1.5 py-0.2 rounded-md bg-rose-500/20 font-semibold">
                {countRupture}
              </span>
            </button>
            <button
              onClick={() => { setStatusFilter('low'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 flex items-center gap-1.5 ${
                statusFilter === 'low'
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'glass-card text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              <span>Stock Bas</span>
              <span className="text-xs px-1.5 py-0.2 rounded-md bg-amber-500/20 font-semibold">
                {countLow}
              </span>
            </button>
            <button
              onClick={() => { setStatusFilter('normal'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 flex items-center gap-1.5 ${
                statusFilter === 'normal'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'glass-card text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>En Stock</span>
              <span className="text-xs px-1.5 py-0.2 rounded-md bg-emerald-500/20 font-semibold">
                {countNormal}
              </span>
            </button>
            <button
              onClick={() => { setStatusFilter('variable'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 flex items-center gap-1.5 ${
                statusFilter === 'variable'
                  ? 'bg-slate-600 text-white shadow-sm'
                  : 'glass-card text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-950/30'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span>Variables</span>
              <span className="text-xs px-1.5 py-0.2 rounded-md bg-slate-500/20 font-semibold">
                {countVariable}
              </span>
            </button>
            <button
              onClick={() => { setStatusFilter('simple'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 flex items-center gap-1.5 ${
                statusFilter === 'simple'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'glass-card text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              <Box className="w-3.5 h-3.5 text-blue-500" />
              <span>Simples</span>
              <span className="text-xs px-1.5 py-0.2 rounded-md bg-blue-500/20 font-semibold">
                {countSimple}
              </span>
            </button>
          </div>

          {/* Controls & Search Bar */}
          <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Rechercher par nom, code-barres, catégorie..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                className="w-full glass-input pl-10 pr-4 py-2.5 rounded-xl text-sm text-slate-900 dark:text-white"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-500">Catégorie:</span>
                <select
                  value={categoryFilter}
                  onChange={(e) => { setCategoryFilter(e.target.value); setCurrentPage(1); }}
                  className="glass-input px-3 py-2 rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
                >
                  <option value="Tous">Toutes les catégories</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-500">Fournisseur:</span>
                <select
                  value={supplierFilter}
                  onChange={(e) => { setSupplierFilter(e.target.value === 'Tous' ? 'Tous' : Number(e.target.value)); setCurrentPage(1); }}
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
                  <ArrowUpDown className="w-3.5 h-3.5" /> Tri:
                </span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="glass-input px-3 py-2 rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
                >
                  <option value="nom-asc">Nom (A → Z)</option>
                  <option value="nom-desc">Nom (Z → A)</option>
                  <option value="stock-asc">Stock (Croissant / Ruptures)</option>
                  <option value="stock-desc">Stock (Décroissant)</option>
                  <option value="prix-asc">Prix (Moins cher)</option>
                  <option value="prix-desc">Prix (Plus cher)</option>
                </select>
              </div>

              {isFiltered && (
                <button
                  onClick={resetAllFilters}
                  className="px-3 py-2 rounded-xl glass-card hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-1 transition-colors"
                  title="Réinitialiser tous les filtres"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Réinitialiser</span>
                </button>
              )}
            </div>
          </div>

          {/* Products Table */}
          <GlassCard className="p-0 overflow-hidden">
            {/* --- Produits en cartes : mobile uniquement. Les 5 actions par
                produit deviennent des cibles de 44px alignées, au lieu de
                petites icônes atteignables seulement après un défilement
                latéral. --- */}
            <div className="md:hidden divide-y divide-slate-200/40 dark:divide-white/5">
              {totalFiltered === 0 ? (
                <div className="p-10 flex flex-col items-center justify-center space-y-2 text-center">
                  <Package className="w-10 h-10 text-slate-300 dark:text-slate-600" />
                  <p className="text-base font-semibold text-slate-700 dark:text-slate-300">
                    Aucun produit ne correspond à vos filtres
                  </p>
                  <p className="text-xs text-slate-500">
                    Essayez de modifier votre recherche ou de réinitialiser les filtres appliqués.
                  </p>
                  {isFiltered && (
                    <Button variant="glass" size="sm" onClick={resetAllFilters} className="mt-2">
                      Réinitialiser les filtres
                    </Button>
                  )}
                </div>
              ) : (
                paginatedProduits.map((p) => {
                  const isOutOfStock = p.stock <= 0;
                  const isLowStock = p.stock <= p.min_stock;
                  return (
                    <div key={p.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 dark:text-white truncate">{p.nom}</div>
                          <div className="text-xs font-mono text-slate-500 mt-0.5 flex items-center gap-1.5">
                            <Barcode className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate selectable">{p.code_barres}</span>
                          </div>
                        </div>
                        <div className="font-semibold text-blue-600 dark:text-blue-400 shrink-0 whitespace-nowrap selectable">
                          {p.is_variable && p.variantes_detaillees && p.variantes_detaillees.length > 0
                            ? (Math.min(...p.variantes_detaillees.map((v) => v.prix)) > 0
                                ? `Dès ${formatCfa(Math.min(...p.variantes_detaillees.map((v) => v.prix)))}`
                                : 'Saisie à la vente')
                            : (p.prix > 0 ? formatCfa(p.prix) : 'Saisie à la vente')}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="blue" size="sm">
                          {p.categorie}
                        </Badge>
                        {p.is_variable ? (
                          <span className="text-xs px-2 py-0.5 rounded-md bg-slate-500/10 text-slate-600 dark:text-slate-400 font-semibold flex items-center gap-1">
                            <Layers className="w-3 h-3" />
                            {p.variantes_detaillees?.length || (p.variantes?.length ?? 0)} variante(s)
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-md bg-slate-500/10 text-slate-600 dark:text-slate-400 font-medium">
                            Simple
                          </span>
                        )}
                        {isOutOfStock ? (
                          <Badge variant="red" dot size="sm">
                            Épuisé (0)
                          </Badge>
                        ) : isLowStock ? (
                          <Badge variant="amber" dot size="sm">
                            Stock bas ({p.stock})
                          </Badge>
                        ) : (
                          <Badge variant="green" size="sm">
                            En stock ({p.stock})
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            setBarcodePrintProduit(p);
                            setIsBarcodePrintModalOpen(true);
                          }}
                          aria-label="Imprimer les étiquettes code-barres"
                          className="touch-target flex-1 flex items-center justify-center rounded-xl glass-card text-blue-600 dark:text-blue-400 tap-scale"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenRestockModal(p)}
                          aria-label="Réapprovisionner"
                          className="touch-target flex-1 flex items-center justify-center rounded-xl glass-card text-emerald-600 dark:text-emerald-400 tap-scale"
                        >
                          <Truck className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenAjustementModal(p)}
                          aria-label="Ajuster le stock"
                          className="touch-target flex-1 flex items-center justify-center rounded-xl glass-card text-slate-600 dark:text-slate-400 tap-scale"
                        >
                          <Scale className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenEditModal(p)}
                          aria-label="Modifier la fiche produit"
                          className="touch-target flex-1 flex items-center justify-center rounded-xl glass-card text-slate-600 dark:text-slate-300 tap-scale"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => p.id && handleDeleteProduit(p.id)}
                          aria-label="Supprimer"
                          className="touch-target flex-1 flex items-center justify-center rounded-xl glass-card text-rose-500 tap-scale"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
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
                    <th className="p-4 font-semibold">Produit</th>
                    <th className="p-4 font-semibold">Code-Barres</th>
                    <th className="p-4 font-semibold">Catégorie</th>
                    <th className="p-4 font-semibold">Prix Unitaire</th>
                    <th className="p-4 font-semibold">État Stock</th>
                    <th className="p-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/40 dark:divide-white/5 text-sm">
                  {totalFiltered === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center">
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <Package className="w-10 h-10 text-slate-300 dark:text-slate-600" />
                          <p className="text-base font-semibold text-slate-700 dark:text-slate-300">
                            Aucun produit ne correspond à vos filtres
                          </p>
                          <p className="text-xs text-slate-500">
                            Essayez de modifier votre recherche ou de réinitialiser les filtres appliqués.
                          </p>
                          {isFiltered && (
                            <Button variant="glass" size="sm" onClick={resetAllFilters} className="mt-2">
                              Réinitialiser les filtres
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedProduits.map((p) => {
                      const isOutOfStock = p.stock <= 0;
                      const isLowStock = p.stock <= p.min_stock;

                      return (
                        <tr
                          key={p.id}
                          className="hover:bg-slate-100/40 dark:hover:bg-slate-800/30 transition-colors"
                        >
                          <td className="p-4 font-semibold text-slate-900 dark:text-white">
                            {p.nom}
                          </td>
                          <td className="p-4 font-mono text-xs text-slate-500 flex items-center gap-1.5">
                            <Barcode className="w-4 h-4 text-slate-500" />
                            {p.code_barres}
                          </td>
                          <td className="p-4">
                            <Badge variant="blue" size="sm">
                              {p.categorie}
                            </Badge>
                            <div className="flex items-center gap-1 mt-1">
                              {p.is_variable ? (
                                <span className="text-xs px-2 py-0.5 rounded-md bg-slate-500/10 text-slate-600 dark:text-slate-400 font-semibold flex items-center gap-1">
                                  <Layers className="w-3 h-3" />
                                  {p.variantes_detaillees?.length || (p.variantes?.length ?? 0)} variante(s)
                                </span>
                              ) : (
                                <span className="text-xs px-2 py-0.5 rounded-md bg-slate-500/10 text-slate-600 dark:text-slate-400 font-medium">
                                  Simple
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-4 font-semibold text-blue-600 dark:text-blue-400">
                            {p.is_variable && p.variantes_detaillees && p.variantes_detaillees.length > 0 ? (
                              <span>{Math.min(...p.variantes_detaillees.map((v) => v.prix)) > 0 ? `Dès ${formatCfa(Math.min(...p.variantes_detaillees.map((v) => v.prix)))}` : 'Saisie à la vente'}</span>
                            ) : (
                              <span>{p.prix > 0 ? formatCfa(p.prix) : 'Saisie à la vente'}</span>
                            )}
                          </td>
                          <td className="p-4">
                            {isOutOfStock ? (
                              <Badge variant="red" dot size="sm">
                                Épuisé (0)
                              </Badge>
                            ) : isLowStock ? (
                              <Badge variant="amber" dot size="sm">
                                Stock bas ({p.stock})
                              </Badge>
                            ) : (
                              <Badge variant="green" size="sm">
                                En stock ({p.stock})
                              </Badge>
                            )}
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => {
                                  setBarcodePrintProduit(p);
                                  setIsBarcodePrintModalOpen(true);
                                }}
                                className="p-2 rounded-xl glass-card hover:bg-blue-500/20 text-blue-600 dark:text-blue-400"
                                title="Imprimer les étiquettes code-barres"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleOpenRestockModal(p)}
                                className="p-2 rounded-xl glass-card hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                                title="Réapprovisionner (+ Entrée de stock)"
                              >
                                <Truck className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleOpenAjustementModal(p)}
                                className="p-2 rounded-xl glass-card hover:bg-slate-500/20 text-slate-600 dark:text-slate-400"
                                title="Ajuster le stock (Inventaire / Casse / Perte)"
                              >
                                <Scale className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleOpenEditModal(p)}
                                className="p-2 rounded-xl glass-card hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                                title="Modifier la fiche produit"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => p.id && handleDeleteProduit(p.id)}
                                className="p-2 rounded-xl glass-card hover:bg-rose-500/20 text-rose-500"
                                title="Supprimer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination & "Voir Plus" Controls Bar */}
            {totalFiltered > 0 && (
              <div className="p-4 border-t border-slate-200/50 dark:border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-900/30">
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span>
                    Affichage de <strong className="text-slate-900 dark:text-white">{startIndex + 1}</strong> à{' '}
                    <strong className="text-slate-900 dark:text-white">{endIndex}</strong> sur{' '}
                    <strong className="text-slate-900 dark:text-white">{totalFiltered}</strong> produits
                  </span>

                  <div className="flex items-center gap-1.5 ml-2">
                    <span>Par page:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
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

                {/* Pagination Buttons & "Voir plus" */}
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    {pageSize < 100 && endIndex < totalFiltered && (
                      <button
                        onClick={() => setPageSize((prev) => prev + 25)}
                        className="px-3 py-1.5 rounded-xl glass-card hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-blue-600 dark:text-blue-400 mr-2"
                      >
                        + Voir 25 de plus
                      </button>
                    )}

                    <button
                      disabled={validCurrentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="p-2 rounded-xl glass-card disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                      title="Page précédente"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    <div className="flex items-center gap-1 text-xs font-semibold">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum = i + 1;
                        if (totalPages > 5 && validCurrentPage > 3) {
                          pageNum = validCurrentPage - 2 + i;
                          if (pageNum > totalPages) pageNum = totalPages - (4 - i);
                        }
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setCurrentPage(pageNum)}
                            className={`w-7 h-7 rounded-lg text-xs font-semibold transition-colors ${
                              validCurrentPage === pageNum
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'glass-card text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      disabled={validCurrentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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
      )}

      {/* TAB ACHATS / RÉAPPROVISIONNEMENTS */}
      {activeTab === 'achats' && (
        <AchatsTab
          achats={achats}
          produits={produits}
          fournisseurs={fournisseurs}
          activeZoneId={activeZoneId}
          onRestock={handleOpenRestockModal}
        />
      )}

      {/* TAB JOURNAL DES AJUSTEMENTS AUDITÉS */}
      {activeTab === 'ajustements' && (
        <AjustementsTab
          ajustements={ajustements}
          produits={produits}
          activeZoneId={activeZoneId}
          onAdjust={handleOpenAjustementModal}
        />
      )}

      {/* ADD / EDIT PRODUCT MODAL (WITH STOCK LOCK IN EDIT MODE) */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingProduit ? 'Modifier le Produit' : 'Ajouter un Nouveau Produit'}
        maxWidth="3xl"
      >
        <form onSubmit={handleSaveProduit} className="space-y-5 max-h-[78vh] overflow-y-auto pr-1">
          {/* 01 : Informations Générales du Produit */}
          <div className="p-4 rounded-xl bg-slate-500/5 border border-slate-200/50 dark:border-white/10 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Informations Principales
              </span>
              {/* Sélecteur de type de produit (Simple vs Variable) */}
              <div className="inline-flex p-1 rounded-xl bg-slate-200/60 dark:bg-slate-800/60 border border-slate-300/40 dark:border-white/5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setIsVariable(false)}
                  className={`px-3 py-1 rounded-lg flex items-center gap-1.5 transition-colors ${
                    !isVariable
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>Produit Simple</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsVariable(true)}
                  className={`px-3 py-1 rounded-lg flex items-center gap-1.5 transition-colors ${
                    isVariable
                      ? 'bg-slate-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Produit Variable</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 block">
                  Nom du produit *
                </label>
                <input
                  type="text"
                  required
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder="ex: iPhone 17 Pro, AirPods Max..."
                  className="w-full glass-input px-3.5 py-2 rounded-xl text-sm font-semibold text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 block">
                  Zone / Boutique *
                </label>
                <select
                  required
                  value={productZoneId}
                  onChange={(e) => setProductZoneId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full glass-input px-3.5 py-2 rounded-xl text-sm text-slate-900 dark:text-white font-medium"
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

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
                  Catégorie
                </label>
                <select
                  required
                  value={categorie}
                  onChange={(e) => setCategorie(e.target.value)}
                  className="w-full glass-input px-3 py-2 rounded-xl text-xs text-slate-900 dark:text-white font-medium"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
                  Fournisseur
                </label>
                <select
                  value={productFournisseurId}
                  onChange={(e) => setProductFournisseurId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full glass-input px-3 py-2 rounded-xl text-xs text-slate-900 dark:text-white font-medium"
                >
                  <option value="">-- Sans Fournisseur --</option>
                  {fournisseurs.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nom}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
                  Seuil Alerte Stock
                </label>
                <input
                  type="number"
                  required
                  value={minStock}
                  onChange={(e) => setMinStock(e.target.value)}
                  placeholder="5"
                  className="w-full glass-input px-3 py-2 rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block">
                    Code-Barres
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCodeBarres(generateRandomBarcode())}
                      className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                      title="Générer un code-barres aléatoire unique"
                    >
                      <RefreshCw className="w-3 h-3" /> Générer
                    </button>
                    <span className="text-slate-300 dark:text-slate-700">·</span>
                    <button
                      type="button"
                      onClick={() => {
                        setScanningVariantTarget('main');
                        setIsStockScannerOpen(true);
                      }}
                      className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-0.5"
                      title="Scanner avec la caméra"
                    >
                      <Camera className="w-2.5 h-2.5" /> Caméra
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={codeBarres}
                    onChange={(e) => setCodeBarres(e.target.value)}
                    placeholder="200XXXXXXXXXX"
                    className="w-full glass-input pl-8 pr-3 py-2 rounded-xl text-xs font-mono font-semibold text-slate-900 dark:text-white"
                  />
                  <Barcode className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                </div>
              </div>
            </div>
          </div>

          {/* 02 : Champs Produit Simple */}
          {!isVariable ? (
            <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
              <div>
                <label className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1 block">
                  {settings?.saisie_prix_a_la_vente ? "Prix de Vente Conseillé (F, Optionnel)" : "Prix de Vente Client (F) *"}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required={!isVariable && !settings?.saisie_prix_a_la_vente}
                  value={prix}
                  onChange={(e) => setPrix(e.target.value)}
                  placeholder={settings?.saisie_prix_a_la_vente ? "Optionnel (saisi à la vente)" : "ex: 150000"}
                  className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-semibold text-blue-600 dark:text-blue-400"
                />
                <span className="text-xs text-slate-500 mt-1 block">
                  {settings?.saisie_prix_a_la_vente
                    ? "Optionnel — Le prix de vente sera saisi par le caissier lors de la vente."
                    : "Prix de vente appliqué automatiquement en caisse."}
                </span>
              </div>

              <div>
                <label className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-1 block">
                  Prix d'Achat / Coût (F)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={coutAchat}
                  onChange={(e) => setCoutAchat(e.target.value)}
                  placeholder="ex: 100000"
                  className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-semibold text-emerald-600 dark:text-emerald-400"
                />
                <span className="text-xs text-slate-500 mt-1 block">
                  {coutAchat
                    ? 'Sert à calculer le bénéfice réel des ventes.'
                    : 'Vide = bénéfice affiché à 100% du prix de vente sur ce produit.'}
                </span>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 flex items-center justify-between">
                  <span>{editingProduit ? 'Stock Actuel en Magasin' : 'Stock Initial de Départ'}</span>
                  {editingProduit && (
                    <span className="text-xs text-amber-500 font-semibold flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Verrouillé
                    </span>
                  )}
                </label>
                {editingProduit ? (
                  <div>
                    <input
                      type="number"
                      disabled
                      value={stock}
                      className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-semibold bg-slate-200/50 dark:bg-slate-800/60 cursor-not-allowed opacity-80 text-slate-700 dark:text-slate-300"
                    />
                    <span className="text-xs text-slate-500 mt-1 block">
                      Modifiable via l'onglet <strong>Réapprovisionnement</strong> ou <strong>Ajustement</strong>.
                    </span>
                  </div>
                ) : (
                  <div>
                    <input
                      type="number"
                      required={!isVariable}
                      value={stock}
                      onChange={(e) => setStock(e.target.value)}
                      placeholder="10"
                      className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-900 dark:text-white"
                    />
                    <span className="text-xs text-slate-500 mt-1 block">Unités disponibles dès la création</span>
                  </div>
                )}
              </div>
            </div>
            {/* Avertissement non-bloquant : on n'empêche pas la vente à perte (rare mais parfois
                voulue, ex: se débarrasser d'un stock dormant), on la signale juste clairement. */}
            {coutAchat && prix && parseFloat(prix) < parseFloat(coutAchat) && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-semibold">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Prix de vente ({formatCfa(parseFloat(prix))}) inférieur au prix d'achat ({formatCfa(parseFloat(coutAchat))}) —
                  ce produit sera vendu à perte.
                </span>
              </div>
            )}
            </>
          ) : (
            /* 03 : Configuration Produit Variable (Attributs & Variantes) */
            <div className="space-y-4 p-4 rounded-xl bg-slate-500/5 border border-slate-500/20">
              {/* Header avec résumé */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-500/20">
                <div>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 uppercase tracking-wide">
                    <Layers className="w-4 h-4" /> Attributs et déclinaisons de variantes
                  </span>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Configurez vos attributs (RAM, Stockage, Couleur...), saisissez leurs spécificités séparées par des virgules et gérez vos déclinaisons.
                  </p>
                </div>
                {variantesDetaillees.length > 0 && (
                  <Badge variant="purple" size="sm" className="shrink-0">
                    {variantesDetaillees.length} déclinaison(s) · Stock total : {variantesDetaillees.reduce((s, v) => s + v.stock, 0)}
                  </Badge>
                )}
              </div>

              {/* 1. Types d'attributs & Saisie fluide par virgule */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                      1. Types d'attributs du produit
                    </label>
                    <span className="text-xs text-slate-500">
                      Saisissez les spécificités séparées par des virgules (ex: 12Go, 4Go, 16Go, 32Go).
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const newIdx = attributs.length;
                      setAttributs((prev) => [
                        ...prev,
                        { nom: '', valeurs: [] },
                      ]);
                      setAttrRawInputs((prev) => ({ ...prev, [newIdx]: '' }));
                    }}
                    className="text-xs text-slate-600 dark:text-slate-400 font-semibold hover:underline shrink-0 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Ajouter un attribut
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {attributs.map((attr, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200/70 dark:border-white/10 space-y-2 shadow-xs"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Nom de l'attribut (ex: RAM, Couleur, Stockage)"
                          value={attr.nom}
                          onChange={(e) => {
                            const updated = [...attributs];
                            updated[idx].nom = e.target.value;
                            setAttributs(updated);
                          }}
                          className="flex-1 glass-input px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setAttributs(attributs.filter((_, i) => i !== idx));
                            const updatedRaw: Record<number, string> = {};
                            attributs
                              .filter((_, i) => i !== idx)
                              .forEach((a, i) => {
                                updatedRaw[i] = attrRawInputs[i >= idx ? i + 1 : i] ?? (a.valeurs || []).join(', ');
                              });
                            setAttrRawInputs(updatedRaw);
                          }}
                          className="p-1.5 text-slate-500 hover:text-rose-500 rounded-lg hover:bg-rose-500/10 transition-colors"
                          title="Supprimer cet attribut"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        <input
                          type="text"
                          placeholder="Spécificités séparées par virgules (ex: 12Go, 4Go, 16Go)"
                          value={attrRawInputs[idx] !== undefined ? attrRawInputs[idx] : (attr.valeurs || []).join(', ')}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setAttrRawInputs((prev) => ({ ...prev, [idx]: raw }));
                            const parsed = raw
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean);
                            const updated = [...attributs];
                            updated[idx].valeurs = parsed;
                            setAttributs(updated);
                          }}
                          className="w-full glass-input px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200"
                        />

                        {/* Badges de visualisation des spécificités */}
                        {attr.valeurs && attr.valeurs.length > 0 && (
                          <div className="flex flex-wrap gap-1 items-center pt-0.5">
                            {attr.valeurs.map((val, valIdx) => (
                              <span
                                key={valIdx}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-500/15 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-500/20"
                              >
                                {val}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextVals = attr.valeurs.filter((_, vi) => vi !== valIdx);
                                    const nextRaw = nextVals.join(', ');
                                    setAttrRawInputs((prev) => ({ ...prev, [idx]: nextRaw }));
                                    const updated = [...attributs];
                                    updated[idx].valeurs = nextVals;
                                    setAttributs(updated);
                                  }}
                                  className="hover:text-rose-500 transition-colors ml-0.5"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. Aide intelligente & Déclinaison automatique */}
              {(() => {
                const activeAttrNames = attributs.filter((a) => a.nom.trim()).map((a) => a.nom.trim());
                const missingAttrVariants = variantesDetaillees.filter((v) =>
                  activeAttrNames.some((attrName) => !v.attributs || !v.attributs[attrName])
                );

                return (
                  <div className="space-y-3 pt-2">
                    {/* Bannière explicative si un attribut a été ajouté et est manquant sur les variantes existantes */}
                    {missingAttrVariants.length > 0 && (
                      <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
                        <Info className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <strong className="font-semibold block text-amber-900 dark:text-amber-200">
                            Attribut(s) nouvellement ajouté(s) détecté(s) !
                          </strong>
                          <span>
                            {missingAttrVariants.length} variante(s) existante(s) n'ont pas encore de valeur pour les nouveaux attributs.
                            Vous pouvez soit <strong>choisir leur valeur directement dans le tableau ci-dessous</strong>, soit cliquer sur <strong>« Générer les combinaisons »</strong> pour combiner automatiquement toutes les options.
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Barre d'outils et actions rapides */}
                    <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-slate-500/20">
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={handleGenerateCombinations}
                          icon={<Layers className="w-3.5 h-3.5" />}
                        >
                          Générer les combinaisons
                        </Button>
                      </div>

                      {variantesDetaillees.length > 1 && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-slate-500 font-medium whitespace-nowrap">Prix uniforme :</span>
                          <input
                            type="number"
                            placeholder="Prix (F)"
                            value={bulkPriceValue}
                            onChange={(e) => setBulkPriceValue(e.target.value)}
                            className="glass-input px-2 py-1 rounded-lg text-xs font-semibold w-24"
                          />
                          <Button
                            type="button"
                            variant="glass"
                            size="sm"
                            onClick={handleApplyBulkPrice}
                            disabled={!bulkPriceValue}
                          >
                            Appliquer
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* 3. Formulaire d'Ajout d'une Variante Spécifique */}
              <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-500/30 space-y-2.5 shadow-xs">
                <span className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                  Ajouter manuellement une variante précise
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 items-end">
                  {attributs.filter((a) => a.nom.trim()).map((attr) => (
                    <div key={attr.nom}>
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-0.5 block truncate">
                        {attr.nom}
                      </label>
                      <input
                        type="text"
                        list={`list-${attr.nom}`}
                        placeholder={`Valeur ${attr.nom}`}
                        value={newVariantAttrs[attr.nom] || ''}
                        onChange={(e) =>
                          setNewVariantAttrs((prev) => ({ ...prev, [attr.nom]: e.target.value }))
                        }
                        className="w-full glass-input px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-900 dark:text-white"
                      />
                      {attr.valeurs && attr.valeurs.length > 0 && (
                        <datalist id={`list-${attr.nom}`}>
                          {attr.valeurs.map((val) => (
                            <option key={val} value={val} />
                          ))}
                        </datalist>
                      )}
                    </div>
                  ))}

                  <div>
                    <label className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-0.5 block">
                      Prix Client (F) *
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="Ex: 350000"
                      value={newVariantPrix}
                      onChange={(e) => setNewVariantPrix(e.target.value)}
                      className="w-full glass-input px-2.5 py-1.5 rounded-lg text-xs font-semibold text-blue-600 dark:text-blue-400"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-0.5 block">
                      Coût d'Achat (F)
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="Ex: 250000"
                      value={newVariantCoutAchat}
                      onChange={(e) => setNewVariantCoutAchat(e.target.value)}
                      className="w-full glass-input px-2.5 py-1.5 rounded-lg text-xs font-semibold text-emerald-600 dark:text-emerald-400"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block truncate">
                        Code-Barres
                      </label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setNewVariantCodeBarres(generateRandomBarcode())}
                          className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                          title="Générer automatiquement"
                        >
                          Auto
                        </button>
                        <span className="text-slate-300 dark:text-slate-700">·</span>
                        <button
                          type="button"
                          onClick={() => {
                            setScanningVariantTarget('newVariant');
                            setIsStockScannerOpen(true);
                          }}
                          className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-0.5"
                          title="Scanner avec la caméra du téléphone"
                        >
                          <Camera className="w-2.5 h-2.5" /> Scan
                        </button>
                      </div>
                    </div>
                    <input
                      type="text"
                      placeholder="Optionnel (ou Auto)"
                      value={newVariantCodeBarres}
                      onChange={(e) => setNewVariantCodeBarres(e.target.value)}
                      className="w-full glass-input px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold text-slate-900 dark:text-white"
                    />
                  </div>

                  {!editingProduit && (
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-0.5 block">
                        Stock Initial
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="5"
                        value={newVariantStock}
                        onChange={(e) => setNewVariantStock(e.target.value)}
                        className="w-full glass-input px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-900 dark:text-white"
                      />
                    </div>
                  )}

                  <div>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={handleAddSingleVariant}
                      className="w-full"
                      icon={<Plus className="w-3.5 h-3.5" />}
                    >
                      Ajouter
                    </Button>
                  </div>
                </div>
                {newVariantCoutAchat && newVariantPrix && parseFloat(newVariantPrix) < parseFloat(newVariantCoutAchat) && (
                  <div className="flex items-start gap-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      Prix de vente ({formatCfa(parseFloat(newVariantPrix))}) inférieur au coût d'achat ({formatCfa(parseFloat(newVariantCoutAchat))}) —
                      cette variante sera vendue à perte.
                    </span>
                  </div>
                )}
              </div>

              {/* 4. TABLEAU DES VARIANTES AVEC GESTION DIRECTE DES ATTRIBUTS & PRIX */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Déclinaisons configurées ({variantesDetaillees.length})
                  </span>
                </div>

                {variantesDetaillees.length === 0 ? (
                  <div className="py-7 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-800/50 bg-white/40 dark:bg-slate-900/30">
                    <Layers className="w-8 h-8 mx-auto text-slate-400 mb-1.5 opacity-60" />
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Aucune variante créée pour le moment
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Cliquez sur « Générer les combinaisons » ci-dessus ou ajoutez une déclinaison manuellement.
                    </p>
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto overflow-x-auto rounded-xl border border-slate-200/70 dark:border-white/10 bg-white dark:bg-slate-900 shadow-xs">
                    <table className="w-full text-left text-xs min-w-[700px]">
                      <thead className="bg-slate-100/90 dark:bg-slate-800 text-slate-500 uppercase sticky top-0 border-b border-slate-200/60 dark:border-white/10">
                        <tr>
                          <th className="p-2.5 font-semibold">Attributs / Spécificités</th>
                          <th className="p-2.5 w-44 font-semibold">Code-Barres</th>
                          <th className="p-2.5 w-32 font-semibold">Prix Client (F)</th>
                          <th className="p-2.5 w-32 font-semibold">Coût d'Achat (F)</th>
                          <th className="p-2.5 w-24 font-semibold">
                            {editingProduit ? (
                              <span className="flex items-center gap-1">
                                Stock <Lock className="w-3 h-3 text-amber-500" />
                              </span>
                            ) : (
                              'Stock Initial'
                            )}
                          </th>
                          <th className="p-2.5 w-12 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/50 dark:divide-white/5">
                        {variantesDetaillees.map((v, i) => {
                          const activeAttrs = attributs.filter((a) => a.nom.trim());

                          return (
                            <tr key={v.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/40 transition-colors">
                              <td className="p-2.5">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {activeAttrs.map((attr) => {
                                    const val = v.attributs ? v.attributs[attr.nom] : undefined;

                                    if (val) {
                                      return (
                                        <span
                                          key={attr.nom}
                                          className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-500/10 text-slate-700 dark:text-slate-300 font-semibold border border-slate-500/20 text-xs"
                                        >
                                          <span className="text-slate-500 font-normal mr-1">{attr.nom}:</span>
                                          {val}
                                        </span>
                                      );
                                    }

                                    // Si l'attribut est nouveau et manquant sur cette variante, afficher un sélecteur en 1 clic
                                    return (
                                      <div key={attr.nom} className="inline-flex items-center gap-1">
                                        <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                                          {attr.nom} :
                                        </span>
                                        <select
                                          value=""
                                          onChange={(e) => handleUpdateVariantAttr(v.id, attr.nom, e.target.value)}
                                          className="text-xs font-semibold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40 focus:ring-1 focus:ring-amber-500"
                                        >
                                          <option value="">Sélectionner {attr.nom}...</option>
                                          {attr.valeurs.map((optionVal) => (
                                            <option key={optionVal} value={optionVal}>
                                              {optionVal}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    );
                                  })}
                                </div>
                              </td>
                              <td className="p-2.5">
                                <div className="relative flex items-center">
                                  <input
                                    type="text"
                                    value={v.code_barres || ''}
                                    onChange={(e) => {
                                      const updated = [...variantesDetaillees];
                                      updated[i].code_barres = e.target.value;
                                      setVariantesDetaillees(updated);
                                    }}
                                    placeholder="200..."
                                    className="w-full glass-input pr-12 pl-2 py-1.5 rounded-lg text-xs font-mono font-semibold"
                                  />
                                  <div className="absolute right-1 flex items-center gap-0.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = [...variantesDetaillees];
                                        updated[i].code_barres = generateRandomBarcode();
                                        setVariantesDetaillees(updated);
                                      }}
                                      className="p-1 text-slate-500 hover:text-blue-500 rounded transition-colors"
                                      title="Générer un code unique"
                                    >
                                      <RefreshCw className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setScanningVariantTarget(v.id);
                                        setIsStockScannerOpen(true);
                                      }}
                                      className="p-1 text-slate-500 hover:text-emerald-500 rounded transition-colors"
                                      title="Scanner le code de cette variante avec la caméra du téléphone"
                                    >
                                      <Camera className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              </td>
                              <td className="p-2.5">
                                <input
                                  type="number"
                                  min="0"
                                  required
                                  value={v.prix}
                                  onChange={(e) => {
                                    const updated = [...variantesDetaillees];
                                    updated[i].prix = parseFloat(e.target.value) || 0;
                                    setVariantesDetaillees(updated);
                                  }}
                                  className="w-full glass-input px-2.5 py-1.5 rounded-lg text-xs font-semibold text-blue-600 dark:text-blue-400"
                                />
                              </td>
                              <td className="p-2.5">
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="—"
                                  value={v.cout_achat_unitaire ?? ''}
                                  onChange={(e) => {
                                    const updated = [...variantesDetaillees];
                                    updated[i].cout_achat_unitaire = e.target.value ? parseFloat(e.target.value) || 0 : undefined;
                                    setVariantesDetaillees(updated);
                                  }}
                                  className="w-full glass-input px-2.5 py-1.5 rounded-lg text-xs font-semibold text-emerald-600 dark:text-emerald-400"
                                />
                                {!!v.cout_achat_unitaire && v.prix < v.cout_achat_unitaire && (
                                  <span
                                    className="text-xs font-semibold text-rose-500 flex items-center gap-0.5 mt-1"
                                    title="Prix de vente inférieur au coût d'achat — cette variante sera vendue à perte."
                                  >
                                    <AlertTriangle className="w-2.5 h-2.5" /> Vente à perte
                                  </span>
                                )}
                              </td>
                              <td className="p-2.5">
                                {editingProduit ? (
                                  <span className="font-semibold text-slate-700 dark:text-slate-300 px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 inline-block text-xs">
                                    {v.stock} en stock
                                  </span>
                                ) : (
                                  <input
                                    type="number"
                                    min="0"
                                    value={v.stock}
                                    onChange={(e) => {
                                      const updated = [...variantesDetaillees];
                                      updated[i].stock = parseInt(e.target.value, 10) || 0;
                                      setVariantesDetaillees(updated);
                                    }}
                                    className="w-full glass-input px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                                  />
                                )}
                              </td>
                              <td className="p-2.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSingleVariant(v.id)}
                                  className="p-1.5 text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200/50 dark:border-white/10">
            <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" icon={<Save className="w-4 h-4" />}>
              {editingProduit ? 'Enregistrer les Modifications' : 'Créer le Produit'}
            </Button>
          </div>
        </form>
      </Modal>

      <RestockModal
        request={restockRequest}
        onClose={() => setRestockRequest(null)}
        onSaved={reload}
        produits={produits}
        fournisseurs={fournisseurs}
        zones={zones}
        activeZoneId={activeZoneId}
      />

      <AdjustmentModal
        request={adjustRequest}
        onClose={() => setAdjustRequest(null)}
        onSaved={reload}
        produits={produits}
      />

      {/* MODAL: Impression des étiquettes code-barres */}
      <BarcodePrintModal
        isOpen={isBarcodePrintModalOpen}
        onClose={() => {
          setIsBarcodePrintModalOpen(false);
          setBarcodePrintProduit(null);
        }}
        produit={barcodePrintProduit}
        settings={settings}
      />

      {/* MODAL: Scanner de Code-barres Caméra (Stock) */}
      <BarcodeScannerModal
        isOpen={isStockScannerOpen}
        onClose={() => {
          setIsStockScannerOpen(false);
          setScanningVariantTarget(null);
        }}
        onScan={handleStockBarcodeScan}
        title={
          scanningVariantTarget === 'main'
            ? 'Scanner le Code-barres Principal'
            : scanningVariantTarget
            ? 'Scanner la Boîte de cette Variante'
            : 'Scanner un Code-barres (Stock)'
        }
      />
    </div>
  );
};
