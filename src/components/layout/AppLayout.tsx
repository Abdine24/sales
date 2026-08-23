import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Sidebar, NavPage } from './Sidebar';
import { Topbar } from './Topbar';
import { useSync } from '../../hooks/useSync';
import { canAccess, clearSession, roleLabel } from '../../services/localAuth';
import { Personnel } from '../../db/db';
import { db, Zone } from '../../db/db';

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
  const [currentPage, setCurrentPage] = useState<NavPage>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const zones = useLiveQuery(() => db.zones.toArray(), []) || [];
  const [activeZoneId, setActiveZoneId] = useState<number | null>(personnel.role === 'gerant' ? personnel.zone_id || null : null);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const { isOnline, pendingCount, isSyncing, triggerSync } = useSync();

  const handleLogout = async () => {
    clearSession();
    window.location.reload();
  };

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors duration-300">
      {/* Sidebar Navigation */}
      <Sidebar
        currentPage={currentPage}
        onNavigate={(page) => {
          if (canAccess(personnel, page)) setCurrentPage(page);
        }}
        pendingCount={pendingCount}
        role={personnel.role}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((collapsed) => !collapsed)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <Topbar
          isOnline={isOnline}
          pendingCount={pendingCount}
          isSyncing={isSyncing}
          triggerSync={triggerSync}
          onQuickSale={() => setCurrentPage('pos')}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          userLabel={`${personnel.nom} (${roleLabel(personnel.role)})`}
          userEmail={personnel.username}
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
