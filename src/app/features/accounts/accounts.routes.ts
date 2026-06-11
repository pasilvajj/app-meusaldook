import { Routes } from '@angular/router';
import { AccountStatementComponent } from './account-statement.component';

export const ACCOUNTS_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./account-list.component').then((m) => m.AccountListComponent) },
  { path: 'extrato/:accountKey', component: AccountStatementComponent },
];
