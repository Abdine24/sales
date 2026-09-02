import { crudRouter } from '../crudRouter.js';

export const zonesRouter = crudRouter({
  table: 'zones',
  columns: ['nom', 'code', 'actif'],
  requiredColumns: ['nom', 'code'],
  orderBy: 'nom asc',
});
