import { Routes } from '@angular/router';

export const REPORTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./reports-hub.component').then((m) => m.ReportsHubComponent),
  },
  {
    path: 'totais-por-categoria',
    loadComponent: () =>
      import('./category-totals-report.component').then((m) => m.CategoryTotalsReportComponent),
  },
];
