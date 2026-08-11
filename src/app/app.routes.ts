import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', loadComponent: () => import('./home/home.page').then(m => m.HomePage) },
  { path: 'login', loadComponent: () => import('./sections/login/login').then(m => m.LoginPage) },
  { path: 'settings', loadComponent: () => import('./sections/settings/settings.page').then(m => m.SettingsPage) },
];
