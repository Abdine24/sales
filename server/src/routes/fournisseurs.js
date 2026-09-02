import { crudRouter } from '../crudRouter.js';

export const fournisseursRouter = crudRouter({
  table: 'fournisseurs',
  columns: ['nom', 'contact', 'email'],
  requiredColumns: ['nom'],
  orderBy: 'nom asc',
});
