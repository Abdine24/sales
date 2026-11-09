import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Users,
  Truck,
  Tags,
  UserCog,
  Settings,
  Receipt,
} from 'lucide-react';
import type { ComponentType } from 'react';

export type NavPage = 'dashboard' | 'pos' | 'ventes' | 'stock' | 'clients' | 'fournisseurs' | 'categories' | 'personnel' | 'settings';

export interface NavItem {
  id: NavPage;
  label: string;
  /** Libellé court de la barre d'onglets du bas (place très limitée). */
  short: string;
  icon: ComponentType<{ className?: string }>;
}

// Une icône = un sens : Clients (Users) et Personnel (UserCog) ne partagent plus la même
// icône, et Paramètres a enfin une roue crantée.
const ITEMS: Record<NavPage, NavItem> = {
  dashboard: { id: 'dashboard', label: 'Tableau de bord', short: 'Accueil', icon: LayoutDashboard },
  pos: { id: 'pos', label: 'Caisse', short: 'Caisse', icon: ShoppingBag },
  ventes: { id: 'ventes', label: 'Ventes et retours', short: 'Ventes', icon: Receipt },
  stock: { id: 'stock', label: 'Stock et produits', short: 'Stock', icon: Package },
  clients: { id: 'clients', label: 'Clients et créances', short: 'Clients', icon: Users },
  fournisseurs: { id: 'fournisseurs', label: 'Fournisseurs', short: 'Fournis.', icon: Truck },
  categories: { id: 'categories', label: 'Catégories et variantes', short: 'Catégories', icon: Tags },
  personnel: { id: 'personnel', label: 'Personnel', short: 'Personnel', icon: UserCog },
  settings: { id: 'settings', label: 'Paramètres', short: 'Réglages', icon: Settings },
};

/** Ordre de la sidebar : la hiérarchie logique du menu. */
export const SIDEBAR_ORDER: NavItem[] = (
  ['dashboard', 'pos', 'ventes', 'stock', 'clients', 'fournisseurs', 'categories', 'personnel', 'settings'] as NavPage[]
).map((id) => ITEMS[id]);

/** Ordre de la barre du bas (mobile) : la fréquence d'usage réelle en boutique, caisse en tête. */
export const BOTTOM_NAV_ORDER: NavItem[] = (
  ['pos', 'ventes', 'stock', 'dashboard', 'clients', 'fournisseurs', 'categories', 'personnel', 'settings'] as NavPage[]
).map((id) => ITEMS[id]);
