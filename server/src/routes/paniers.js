import { crudRouter } from '../crudRouter.js';

// Paniers mis en attente à la caisse (POS). `req.query.vendeur_id` n'est pas filtré ici —
// on renvoie tous les paniers, le frontend filtre par vendeur comme il le fait déjà avec
// Dexie (liste courte, pas besoin d'optimiser côté serveur pour l'instant).
export const paniersRouter = crudRouter({
  table: 'paniers_en_attente',
  columns: ['nom_reference', 'lignes', 'total', 'vendeur_id'],
  requiredColumns: ['nom_reference', 'lignes'],
  jsonColumns: ['lignes'],
  orderBy: 'date desc',
});
