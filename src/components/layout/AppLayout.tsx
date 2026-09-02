import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar, NavPage } from './Sidebar';
import { Topbar, ThemeMode } from './Topbar';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { canAccess, firstAllowedPage, roleLabel } from '../../services/localAuth';
import { signOutSupabase } from '../../services/supabaseAuth';
import type { Personnel, AppSettings, Zone } from '../../db/db';
import { apiGet } from '../../services/api';

interface AppLayoutProps {
  personnel: Personnel;
  children: (props: {
    currentPage: NavPage;
    setCurrentPage: (page: NavPage) => void;
    searchQuery: string;
    activeZoneId: number | null;
  }) => React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children, personnel }) => {
  const [currentPage, setCurrentPage] = useState<NavPage>(() => firstAllowedPage(personnel) as NavPage);
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [zones, setZones] = useState<Zone[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [activeZoneId, setActiveZoneId] = useState<number | null>(personnel.role === 'gerant' ? personnel.zone_id || null : null);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('app-theme-mode') as ThemeMode;
    if (saved === 'light' || saved === 'dark' || saved === 'emerald' || saved === 'contrast') return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const { isOnline } = useOnlineStatus();

  const handleLogout = async () => {
    await signOutSupabase();
    window.location.reload();
  };

  const reloadSettings = useCallback(() => {
    apiGet<AppSettings>('/settings').then(setSettings).catch(() => {});
  }, []);

  useEffect(() => {
    apiGet<Zone[]>('/zones').then(setZones).catch(() => {});
    reloadSettings();
    window.addEventListener('app-settings-updated', reloadSettings);
    return () => window.removeEventListener('app-settings-updated', reloadSettings);
  }, [reloadSettings]);

  useEffect(() => {
    if (settings?.nom_site) {
      document.title = `${settings.nom_site} - Gestion de Vente & Caisse`;
    }
  }, [settings?.nom_site]);

  useEffect(() => {
    localStorage.setItem('app-theme-mode', themeMode);
    const root = document.documentElement;
    root.classList.remove('dark', 'theme-emerald', 'theme-contrast');

    if (themeMode === 'light') {
      // Standard light glass mode
    } else if (themeMode === 'dark') {
      root.classList.add('dark');
    } else if (themeMode === 'emerald') {
      root.classList.add('dark', 'theme-emerald');
    } else if (themeMode === 'contrast') {
      root.classList.add('theme-contrast');
    }
  }, [themeMode]);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors duration-300">
      {/* Sidebar Navigation */}
      <Sidebar
        currentPage={currentPage}
        onNavigate={(page) => {
          if (canAccess(personnel, page)) setCurrentPage(page);
        }}
        role={personnel.role}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((collapsed) => !collapsed)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <Topbar
          isOnline={isOnline}
          onQuickSale={() => setCurrentPage('pos')}
          themeMode={themeMode}
          setThemeMode={setThemeMode}
          userLabel={personnel.username}
          userEmail={roleLabel(personnel.role)}
          onLogout={handleLogout}
          zones={zones}
          activeZoneId={activeZoneId}
          onZoneChange={(zoneId) => personnel.role === 'admin' && setActiveZoneId(zoneId)}
          canSelectAll={personnel.role === 'admin'}
        />

        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6 space-y-6">
          {children({ currentPage, setCurrentPage, searchQuery, activeZoneId })}
        </main>
      </div>
    </div>
  );
};
