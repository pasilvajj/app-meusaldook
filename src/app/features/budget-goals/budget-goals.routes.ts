import { Routes } from '@angular/router';

export const BUDGET_GOALS_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./budget-goals-page.component').then((m) => m.BudgetGoalsPageComponent) },
];
