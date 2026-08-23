import React, { useEffect } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { Dashboard } from './pages/Dashboard';
import { POS } from './pages/POS';
import { Stock } from './pages/Stock';
import { Clients } from './pages/Clients';
import { Fournisseurs } from './pages/Fournisseurs';
import { SyncManager } from './pages/SyncManager';
import { Categories } from './pages/Categories';
import { initializeSeedData } from './db/seed';
import { AuthGate } from './pages/AuthGate';
import { Personnel } from './pages/Personnel';
import { Settings } from './pages/Settings';
import { AUTH_REQUIRED, canAccess } from './services/localAuth';
import { Personnel as PersonnelUser } from './db/db';

function AuthenticatedApp({ personnel }: { personnel: PersonnelUser }) {
  useEffect(() => {
    initializeSeedData().catch((err) =>
      console.error('Failed to initialize seed data:', err)
    );
  }, []);

  return (
    <AppLayout personnel={personnel}>
      {({ currentPage, setCurrentPage, activeZoneId }) => {
        const navigate = (page: Parameters<typeof setCurrentPage>[0]) => {
          if (canAccess(personnel, page)) setCurrentPage(page);
        };
        switch (currentPage) {
          case 'dashboard':
            return <Dashboard onNavigate={navigate} activeZoneId={activeZoneId} />;
          case 'pos':
            return <POS activeZoneId={activeZoneId} vendeur={personnel} />;
          case 'stock':
            return <Stock activeZoneId={activeZoneId} />;
          case 'clients':
            return <Clients />;
          case 'fournisseurs':
            return <Fournisseurs />;
          case 'categories':
            return <Categories />;
          case 'personnel':
            return <Personnel currentUser={personnel} />;
          case 'settings':
            return <Settings />;
          case 'sync':
            return <SyncManager />;
          default:
            return <Dashboard onNavigate={navigate} activeZoneId={activeZoneId} />;
        }
      }}
    </AppLayout>
  );
}

export function App() {
  if (!AUTH_REQUIRED) {
    const localAdmin: PersonnelUser = {
      nom: 'Administrateur local',
      identifiant: 'LOCALADM01',
      username: 'admin-local',
      password_hash: '',
      role: 'admin',
      actif: true,
      principal: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return <AuthenticatedApp personnel={localAdmin} />;
  }

  return <AuthGate>{(personnel) => <AuthenticatedApp personnel={personnel} />}</AuthGate>;
}

export default App;
