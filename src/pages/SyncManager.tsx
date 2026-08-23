import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  RefreshCw,
  Database,
  Cloud,
  CheckCircle2,
  Clock,
  Wifi,
  WifiOff,
  Trash2,
} from 'lucide-react';
import { db } from '../db/db';
import { useSync } from '../hooks/useSync';
import { isSupabaseConfigured } from '../services/supabase';
import { GlassCard } from '../components/ui/GlassCard';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

export const SyncManager: React.FC = () => {
  const syncItems = useLiveQuery(() => db.file_attente_sync.reverse().toArray(), []) || [];
  const { isOnline, pendingCount, isSyncing, triggerSync } = useSync();

  const supabaseActive = isSupabaseConfigured();

  const handleClearHistory = async () => {
    if (confirm('Voulez-vous effacer la file d\'attente de synchronisation ?')) {
      await db.file_attente_sync.clear();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Moteur de Synchronisation Offline-First
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Supervision de la file d'attente IndexedDB <code className="font-mono text-xs text-blue-500">file_attente_sync</code> et de la réplication Supabase.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="glass"
            icon={<Trash2 className="w-4 h-4 text-rose-500" />}
            onClick={handleClearHistory}
          >
            Vider l'historique
          </Button>
          <Button
            variant="primary"
            icon={<RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />}
            onClick={triggerSync}
            disabled={isSyncing || !isOnline}
          >
            Synchroniser Maintenant
          </Button>
        </div>
      </div>

      {/* Network & Service Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <GlassCard hoverEffect>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-slate-400">
              État de la Connexion Network
            </span>
            {isOnline ? (
              <Wifi className="w-5 h-5 text-emerald-500" />
            ) : (
              <WifiOff className="w-5 h-5 text-amber-500" />
            )}
          </div>
          <div className="mt-3">
            <div className="text-xl font-black text-slate-900 dark:text-white">
              {isOnline ? 'En Ligne (Online)' : 'Hors-Ligne (Offline)'}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {isOnline
                ? 'Les requêtes s\'exécutent localement puis se synchronisent.'
                : 'Toutes les écritures s\'effectuent dans IndexedDB Dexie.js.'}
            </p>
          </div>
        </GlassCard>

        <GlassCard hoverEffect>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-slate-400">
              Actions en Attente
            </span>
            <Clock className="w-5 h-5 text-amber-500" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {pendingCount}
            </div>
            {pendingCount > 0 ? (
              <Badge variant="amber" dot size="sm">
                Attente envoi
              </Badge>
            ) : (
              <Badge variant="green" size="sm">
                File vide
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Paquets prêts pour le serveur distant
          </p>
        </GlassCard>

        <GlassCard hoverEffect>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-slate-400">
              Base Distante (Supabase)
            </span>
            <Cloud className="w-5 h-5 text-blue-500" />
          </div>
          <div className="mt-3">
            <div className="text-xl font-black text-slate-900 dark:text-white">
              {supabaseActive ? 'Supabase Connecté' : 'Mode Simulation Local'}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {supabaseActive
                ? 'PostgreSQL distant actif & prêt'
                : 'IndexedDB actif (Ajoutez vos clés Supabase dans .env pour la prod)'}
            </p>
          </div>
        </GlassCard>
      </div>

      {/* Sync Queue Table */}
      <GlassCard className="p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-200/50 dark:border-white/10 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-500" />
            File d'Attente de Synchronisation ({syncItems.length})
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/50 dark:border-white/10 bg-slate-50/50 dark:bg-slate-900/40 text-xs text-slate-500 uppercase tracking-wider">
                <th className="p-4 font-semibold">ID / Date</th>
                <th className="p-4 font-semibold">Action</th>
                <th className="p-4 font-semibold">Table Dexie</th>
                <th className="p-4 font-semibold">Payload (JSON)</th>
                <th className="p-4 font-semibold text-right">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/40 dark:divide-white/5 text-sm">
              {syncItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                    Aucun événement dans la file de synchronisation.
                  </td>
                </tr>
              ) : (
                syncItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-100/40 dark:hover:bg-slate-800/30">
                    <td className="p-4 text-xs font-mono text-slate-400">
                      #{item.id} • {new Date(item.date_creation).toLocaleTimeString('fr-FR')}
                    </td>
                    <td className="p-4">
                      <Badge
                        variant={
                          item.action === 'INSERT'
                            ? 'green'
                            : item.action === 'UPDATE'
                            ? 'blue'
                            : 'red'
                        }
                        size="sm"
                      >
                        {item.action}
                      </Badge>
                    </td>
                    <td className="p-4 font-mono text-xs font-bold text-slate-900 dark:text-white">
                      {item.table}
                    </td>
                    <td className="p-4 text-xs font-mono text-slate-500 max-w-xs truncate">
                      {item.data}
                    </td>
                    <td className="p-4 text-right">
                      {item.status === 'synchronise' ? (
                        <Badge variant="green" size="sm">
                          <CheckCircle2 className="w-3 h-3" /> Synchronisé
                        </Badge>
                      ) : (
                        <Badge variant="amber" dot size="sm">
                          En Attente
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
};
