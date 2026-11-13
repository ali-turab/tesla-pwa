import { Routes } from '@angular/router';
import { AuthCallbackComponent } from './features/auth-callback/auth-callback.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';

// `auth/callback` must stay above the `**` catch-all so the OAuth parameters are processed, not redirected away.
export const routes: Routes = [
  { path: 'auth/callback', component: AuthCallbackComponent, title: 'Connecting Tesla…' },
  { path: '', component: DashboardComponent, pathMatch: 'full', title: 'Tesla Dashboard' },
  { path: '**', redirectTo: '' },
];
