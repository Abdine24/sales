import { crudRouter } from '../crudRouter.js';

export const categoriesRouter = crudRouter({
  table: 'categories',
  columns: ['nom', 'description'],
  requiredColumns: ['nom'],
  orderBy: 'nom asc',
});
