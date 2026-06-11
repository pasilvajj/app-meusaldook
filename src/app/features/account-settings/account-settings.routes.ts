import { Routes } from '@angular/router';

export const ACCOUNT_SETTINGS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./account-settings-page.component').then((m) => m.AccountSettingsPageComponent),
  },
];
