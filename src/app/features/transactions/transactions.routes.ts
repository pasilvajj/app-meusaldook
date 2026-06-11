import { Routes } from '@angular/router';

export const TRANSACTION_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./transaction-list.component').then((m) => m.TransactionListComponent) },
  {
    path: 'new',
    loadComponent: () => import('./transaction-new-bridge.component').then((m) => m.TransactionNewBridgeComponent),
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./transaction-form.component').then((m) => m.TransactionFormComponent),
  },
];
