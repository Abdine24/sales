import React, { useMemo, useState } from 'react';
import { Search, Package, Users, ShoppingBag, Banknote } from 'lucide-react';
import type { Vente, LigneVente } from '../db/db';
import { GlassCard } from './ui/GlassCard';
import { DateRangePicker } from './ui/DateRangePicker';
import { formatCfa } from '../utils/currency';

// Onglet « Par produit » de la page Ventes : on tape un produit et on voit toutes ses ventes
// sur la période (qui l'a vendu, à qui, combien, à quel prix). Travaille uniquement sur les
// données déjà chargées par Ventes.tsx (ventes + lignes) — aucun appel API supplémentaire.
interface VentesParProduitProps {
  ventes: Vente[];
  lignesVente: LigneVente[];
  dateDebut: string; // YYYY-MM-DD
  dateFin: string; // YYYY-MM-DD
  onDateChange: (dateDebut: string, dateFin: string) => void;
  activeZoneId: number | null;
}

interface LigneDetail {
  ligne: LigneVente;
  vente: Vente;
}

const SANS_VENDEUR = '—';

export const VentesParProduit: React.FC<VentesParProduitProps> = ({
  ventes,
  lignesVente,
  dateDebut,
  dateFin,
  onDateChange,
  activeZoneId,
}) => {
  const [search, setSearch] = useState('');
  const [vendeurFilter, setVendeurFilter] = useState('all');

  // Ventes de la période (et de la zone active), indexées par id — même règle de date que
  // la liste « Par vente » de Ventes.tsx.
  const ventesPeriode = useMemo(() => {
    const map = new Map<string, Vente>();
    for (const v of ventes) {
      const date = v.date.split('T')[0];
      if (date < dateDebut || date > dateFin) continue;
      if (activeZoneId !== null && v.zone_id !== activeZoneId) continue;
      map.set(v.id, v);
    }
    return map;
  }, [ventes, dateDebut, dateFin, activeZoneId]);

  const q = search.toLowerCase().trim();

  // Lignes du produit recherché sur la période, avant le filtre vendeur (qui s'en sert pour
  // proposer uniquement les vendeurs concernés).
  const lignesProduit = useMemo<LigneDetail[]>(() => {
    if (!q) return [];
    const result: LigneDetail[] = [];
    for (const ligne of lignesVente) {
      const vente = ventesPeriode.get(ligne.vente_id);
      if (!vente) continue;
      const nom = `${ligne.produit_nom} ${ligne.variante || ''}`.toLowerCase();
      if (!nom.includes(q)) continue;
      result.push({ ligne, vente });
    }
    return result.sort((a, b) => b.vente.date.localeCompare(a.vente.date));
  }, [lignesVente, ventesPeriode, q]);

  const vendeurs = useMemo(
    () => Array.from(new Set(lignesProduit.map((d) => d.vente.vendeur_nom || SANS_VENDEUR))).sort(),
    [lignesProduit]
  );

  const lignes = useMemo(
    () =>
      vendeurFilter === 'all'
        ? lignesProduit
        : lignesProduit.filter((d) => (d.vente.vendeur_nom || SANS_VENDEUR) === vendeurFilter),
    [lignesProduit, vendeurFilter]
  );

  const totalQuantite = lignes.reduce((s, d) => s + d.ligne.quantite, 0);
  const totalMontant = lignes.reduce((s, d) => s + d.ligne.quantite * d.ligne.prix_unitaire, 0);
  const nbVentes = new Set(lignes.map((d) => d.vente.id)).size;

  // Répartition par vendeur, du plus gros vendeur au plus petit
  const parVendeur = useMemo(() => {
    const map = new Map<string, { quantite: number; montant: number; ventes: Set<string> }>();
    for (const { ligne, vente } of lignes) {
      const nom = vente.vendeur_nom || SANS_VENDEUR;
      const entry = map.get(nom) || { quantite: 0, montant: 0, ventes: new Set<string>() };
      entry.quantite += ligne.quantite;
      entry.montant += ligne.quantite * ligne.prix_unitaire;
      entry.ventes.add(vente.id);
      map.set(nom, entry);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].quantite - a[1].quantite);
  }, [lignes]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setVendeurFilter('all');
              }}
              placeholder="Tape le nom d'un produit (ex: Samsung A15)..."
              className="w-full glass-input pl-10 pr-4 py-2.5 rounded-2xl text-sm text-slate-900 dark:text-white"
            />
          </div>
          <select
            value={vendeurFilter}
            onChange={(e) => setVendeurFilter(e.target.value)}
            disabled={vendeurs.length === 0}
            className="glass-input px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            <option value="all">Tous les vendeurs</option>
            {vendeurs.map((nom) => (
              <option key={nom} value={nom}>
                {nom === SANS_VENDEUR ? 'Vendeur inconnu' : nom}
              </option>
            ))}
          </select>
          {/* Période : jour précis, mois en cours, mois dernier, dates au choix... */}
          <DateRangePicker startDate={dateDebut} endDate={dateFin} onChange={onDateChange} align="right" />
        </div>
      </GlassCard>

      {!q ? (
        <GlassCard className="p-10 text-center text-sm text-slate-400">
          <Package className="w-8 h-8 mx-auto mb-3 text-slate-300" />
          Tape le nom d'un produit pour voir qui l'a vendu, à qui, en quelle quantité et à quel prix sur la
          période choisie.
        </GlassCard>
      ) : lignes.length === 0 ? (
        <GlassCard className="p-10 text-center text-sm text-slate-400 italic">
          Aucune vente de « {search.trim()} » sur cette période.
        </GlassCard>
      ) : (
        <>
          {/* Résumé */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Quantité vendue', value: String(totalQuantite), icon: <Package className="w-4 h-4" /> },
              { label: "Chiffre d'affaires", value: formatCfa(totalMontant), icon: <Banknote className="w-4 h-4" /> },
              { label: 'Ventes', value: String(nbVentes), icon: <ShoppingBag className="w-4 h-4" /> },
              { label: 'Vendeurs', value: String(parVendeur.length), icon: <Users className="w-4 h-4" /> },
            ].map((stat) => (
              <GlassCard key={stat.label} className="p-4">
                <div className="flex items-center gap-2 text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                  {stat.icon}
                  {stat.label}
                </div>
                <div className="mt-1.5 text-xl font-black text-slate-900 dark:text-white">{stat.value}</div>
              </GlassCard>
            ))}
          </div>

          {/* Par vendeur */}
          <GlassCard className="p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200/50 dark:border-white/10 font-bold text-sm text-slate-900 dark:text-white">
              Qui l'a vendu
            </div>
            <div className="divide-y divide-slate-200/40 dark:divide-white/5">
              {parVendeur.map(([nom, stats]) => (
                <div key={nom} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-white truncate">
                      {nom === SANS_VENDEUR ? 'Vendeur inconnu' : nom}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {stats.ventes.size} vente{stats.ventes.size > 1 ? 's' : ''}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-slate-900 dark:text-white">{stats.quantite} unité{stats.quantite > 1 ? 's' : ''}</div>
                    <div className="text-[11px] text-slate-400">{formatCfa(stats.montant)}</div>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Détail des ventes */}
          <GlassCard className="p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200/50 dark:border-white/10 font-bold text-sm text-slate-900 dark:text-white">
              Détail des ventes ({lignes.length})
            </div>

            {/* Mobile : cartes */}
            <div className="md:hidden divide-y divide-slate-200/40 dark:divide-white/5">
              {lignes.map(({ ligne, vente }) => (
                <div key={`${vente.id}-${ligne.id}`} className="p-4 flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-white truncate">
                      {ligne.produit_nom}
                      {ligne.variante ? <span className="text-slate-400 font-normal"> · {ligne.variante}</span> : null}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{formatDate(vente.date)}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Vendeur : {vente.vendeur_nom || 'inconnu'} · Client : {vente.client_nom || 'Client Passant'}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-slate-900 dark:text-white">{formatCfa(ligne.quantite * ligne.prix_unitaire)}</div>
                    <div className="text-[11px] text-slate-400">
                      {ligne.quantite} × {formatCfa(ligne.prix_unitaire)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Grand écran : tableau */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200/50 dark:border-white/10">
                    <th className="px-4 py-2.5 font-bold">Date</th>
                    <th className="px-4 py-2.5 font-bold">Produit</th>
                    <th className="px-4 py-2.5 font-bold">Vendeur</th>
                    <th className="px-4 py-2.5 font-bold">Client</th>
                    <th className="px-4 py-2.5 font-bold text-right">Qté</th>
                    <th className="px-4 py-2.5 font-bold text-right">Prix unitaire</th>
                    <th className="px-4 py-2.5 font-bold text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/40 dark:divide-white/5">
                  {lignes.map(({ ligne, vente }) => (
                    <tr key={`${vente.id}-${ligne.id}`} className="text-slate-700 dark:text-slate-200">
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">{formatDate(vente.date)}</td>
                      <td className="px-4 py-2.5">
                        <span className="font-semibold text-slate-900 dark:text-white">{ligne.produit_nom}</span>
                        {ligne.variante ? <span className="text-slate-400"> · {ligne.variante}</span> : null}
                      </td>
                      <td className="px-4 py-2.5">{vente.vendeur_nom || 'Inconnu'}</td>
                      <td className="px-4 py-2.5">{vente.client_nom || 'Client Passant'}</td>
                      <td className="px-4 py-2.5 text-right font-semibold">{ligne.quantite}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">{formatCfa(ligne.prix_unitaire)}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap font-bold text-slate-900 dark:text-white">
                        {formatCfa(ligne.quantite * ligne.prix_unitaire)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </>
      )}
    </div>
  );
};
