import { Routes } from '@angular/router';
import { AccountStatementComponent } from './account-statement.component';

export const ACCOUNTS_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./account-list.component').then((m) => m.AccountListComponent) },
  { path: 'fatura/:accountKey', loadComponent: () => import('./credit-card-invoice.component').then((m) => m.CreditCardInvoiceComponent) },
  { path: 'extrato/:accountKey', component: AccountStatementComponent },
];
