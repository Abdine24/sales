import React, { useMemo, useState } from 'react';
import { Search, Undo2 } from 'lucide-react';
import type { Retour, MotifRetour, ModeRemboursement } from '../db/db';
import { GlassCard } from './ui/GlassCard';
import { DateRangePicker } from './ui/DateRangePicker';
import { formatCfa } from '../utils/currency';

// Onglet « Retours » de la page Ventes : historique des retours d'articles enregistrés depuis
// l'onglet « Par vente » (bouton Retour). Données déjà chargées par Ventes.tsx (/retours).
interface RetoursListeProps {
  retours: Retour[];
  dateDebut: string; // YYYY-MM-DD
  dateFin: string; // YYYY-MM-DD
  onDateChange: (dateDebut: string, dateFin: string) => void;
  activeZoneId: number | null;
}

const MOTIFS: Record<MotifRetour, string> = {
  client_insatisfait: 'Client insatisfait',
  defectueux: 'Article défectueux',
  erreur_caisse: 'Erreur de caisse',
  autre: 'Autre motif',
};

const MODES: Record<ModeRemboursement, string> = {
  especes: 'Espèces',
  mobile_money: 'Mobile money',
  virement: 'Virement',
};

export const RetoursListe: React.FC<RetoursListeProps> = ({ retours, dateDebut, dateFin, onDateChange, activeZoneId }) => {
  const [search, setSearch] = useState('');
  const q = search.toLowerCase().trim();

  const filtres = useMemo(
    () =>
      retours.filter((r) => {
        const date = r.date.split('T')[0];
        if (date < dateDebut || date > dateFin) return false;
        if (activeZoneId !== null && r.zone_id !== activeZoneId) return false;
        if (!q) return true;
        return (
          (r.client_nom || '').toLowerCase().includes(q) ||
          (r.vendeur_nom || '').toLowerCase().includes(q) ||
          (r.vente_id || '').toLowerCase().includes(q) ||
          (r.lignes || []).some((l) => `${l.produit_nom} ${l.variante || ''}`.toLowerCase().includes(q))
        );
      }),
    [retours, dateDebut, dateFin, activeZoneId, q]
  );

  const totalRembourse = filtres.reduce((s, r) => s + r.montant_total, 0);
  const totalArticles = filtres.reduce((s, r) => s + (r.lignes || []).reduce((n, l) => n + l.quantite, 0), 0);

  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher produit, client, vendeur ou réf. de vente..."
              className="w-full glass-input pl-10 pr-4 py-2.5 rounded-2xl text-sm text-slate-900 dark:text-white"
            />
          </div>
          <DateRangePicker startDate={dateDebut} endDate={dateFin} onChange={onDateChange} align="right" />
        </div>
      </GlassCard>

      <div className="grid grid-cols-2 gap-3">
        <GlassCard className="p-4">
          <div className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">Retours</div>
          <div className="mt-1.5 text-xl font-black text-slate-900 dark:text-white">
            {filtres.length} <span className="text-sm font-semibold text-slate-400">({totalArticles} article{totalArticles > 1 ? 's' : ''})</span>
          </div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">Montant remboursé</div>
          <div className="mt-1.5 text-xl font-black text-rose-600 dark:text-rose-400">{formatCfa(totalRembourse)}</div>
        </GlassCard>
      </div>

      <GlassCard className="p-0 overflow-hidden">
        {filtres.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400 italic">
            <Undo2 className="w-8 h-8 mx-auto mb-3 text-slate-300" />
            Aucun retour sur cette période. Pour en enregistrer un, ouvre l'onglet « Par vente » et clique sur « Retour » sur la vente concernée.
          </div>
        ) : (
          <div className="divide-y divide-slate-200/40 dark:divide-white/5">
            {filtres.map((r, index) => (
              <div key={r.id ?? `${r.vente_id}-${index}`} className="p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-sm">
                <div className="min-w-0 space-y-1">
                  <div className="text-[11px] text-slate-400">
                    {new Date(r.date).toLocaleString('fr-FR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {r.vente_id && (
                      <>
                        {' · '}Vente <span className="font-mono">#{r.vente_id.slice(0, 8)}</span>
                      </>
                    )}
                  </div>
                  {(r.lignes || []).map((l, i) => (
                    <div key={i} className="font-semibold text-slate-900 dark:text-white">
                      {l.quantite} × {l.produit_nom}
                      {l.variante ? <span className="text-slate-400 font-normal"> · {l.variante}</span> : null}
                    </div>
                  ))}
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {MOTIFS[r.motif] || r.motif} · Client : {r.client_nom || 'Client Passant'} · Enregistré par : {r.vendeur_nom || 'inconnu'}
                  </div>
                  {r.commentaire && <div className="text-[11px] italic text-slate-400">« {r.commentaire} »</div>}
                </div>
                <div className="sm:text-right shrink-0">
                  <div className="font-bold text-rose-600 dark:text-rose-400">- {formatCfa(r.montant_total)}</div>
                  <div className="text-[11px] text-slate-400">{MODES[r.mode_remboursement] || r.mode_remboursement}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
};
