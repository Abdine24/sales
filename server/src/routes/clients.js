import { crudRouter } from '../crudRouter.js';

export const clientsRouter = crudRouter({
  table: 'clients',
  columns: ['nom', 'telephone', 'total_dette', 'email', 'adresse', 'vendeur_id'],
  requiredColumns: ['nom'],
  orderBy: 'nom asc',
});
