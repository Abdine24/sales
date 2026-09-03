import React, { lazy, Suspense } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { AuthGate } from './pages/AuthGate';
import { canAccess, firstAllowedPage } from './services/localAuth';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { LicenceGate } from './components/LicenceGate';
import { OnlineRequiredGate } from './components/OnlineRequiredGate';
import { Loader2, Lock } from 'lucide-react';

const OwnerConsole = lazy(() => import('./pages/OwnerConsole').then((m) => ({ default: m.OwnerConsole })));

// Chargement à la demande : le bundle initial n'embarque plus recharts,
// les grosses pages, etc. — elles arrivent quand l'utilisateur les ouvre.
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const POS = lazy(() => import('./pages/POS').then((m) => ({ default: m.POS })));
const Ventes = lazy(() => import('./pages/Ventes').then((m) => ({ default: m.Ventes })));
const Stock = lazy(() => import('./pages/Stock').then((m) => ({ default: m.Stock })));
const Clients = lazy(() => import('./pages/Clients').then((m) => ({ default: m.Clients })));
const Fournisseurs = lazy(() => import('./pages/Fournisseurs').then((m) => ({ default: m.Fournisseurs })));
const Categories = lazy(() => import('./pages/Categories').then((m) => ({ default: m.Categories })));
const Personnel = lazy(() => import('./pages/Personnel').then((m) => ({ default: m.Personnel })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));

function PageFallback() {
  return (
    <div className="flex-1 flex items-center justify-center py-20 text-slate-400">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  );
}

function AccessDenied({ onGoHome }: { onGoHome: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 p-10">
      <div className="p-4 rounded-3xl bg-rose-500/10 text-rose-500">
        <Lock className="w-8 h-8" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Accès restreint</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
          Votre rôle ne vous permet pas d'ouvrir cette page.
        </p>
      </div>
      <button
        onClick={onGoHome}
        className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
      >
        Retour à l'accueil
      </button>
    </div>
  );
}

function AuthenticatedApp() {
  const { personnel } = useAuth();

  if (!personnel) return null;

  return (
    <AppLayout personnel={personnel}>
      {({ currentPage, setCurrentPage, activeZoneId }) => {
        const navigate = (page: Parameters<typeof setCurrentPage>[0]) => {
          if (canAccess(personnel, page)) setCurrentPage(page);
        };

        // Garde au rendu : empêche l'affichage d'une page non autorisée
        // (ex. un caissier qui arriverait sur le tableau de bord)
        if (!canAccess(personnel, currentPage)) {
          return (
            <AccessDenied
              onGoHome={() => setCurrentPage(firstAllowedPage(personnel) as typeof currentPage)}
            />
          );
        }

        const page = (() => {
          switch (currentPage) {
            case 'pos':
              return <POS activeZoneId={activeZoneId} vendeur={personnel} />;
            case 'ventes':
              return <Ventes activeZoneId={activeZoneId} vendeur={personnel} />;
            case 'stock':
              return <Stock activeZoneId={activeZoneId} />;
            case 'clients':
              return <Clients activeZoneId={activeZoneId} vendeur={personnel} />;
            case 'fournisseurs':
              return <Fournisseurs />;
            case 'categories':
              return <Categories />;
            case 'personnel':
              return <Personnel currentUser={personnel} />;
            case 'settings':
              return <Settings />;
            case 'dashboard':
            default:
              return <Dashboard onNavigate={navigate} activeZoneId={activeZoneId} />;
          }
        })();

        return <Suspense fallback={<PageFallback />}>{page}</Suspense>;
      }}
    </AppLayout>
  );
}

export function App() {
  // Espace propriétaire — chemin caché, complètement en dehors du flux tenant/Supabase habituel
  // (pas de résolution de boutique, pas de session Supabase requise : authentification par mot
  // de passe dédié, voir services/ownerApi.ts et server/src/routes/plateforme.js). Vérifié en
  // tout premier, avant même OnlineRequiredGate, pour ne dépendre d'aucun autre état de l'app.
  if (window.location.pathname === '/proprietaire') {
    return (
      <Suspense fallback={<PageFallback />}>
        <OwnerConsole />
      </Suspense>
    );
  }

  return (
    <OnlineRequiredGate>
      <AuthProvider>
        <AuthGate>
          <LicenceGate>
            <AuthenticatedApp />
          </LicenceGate>
        </AuthGate>
      </AuthProvider>
    </OnlineRequiredGate>
  );
}

export default App;
