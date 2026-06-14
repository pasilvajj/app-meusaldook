import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../core/services/auth.service';
import { MeApiService } from '../core/services/me-api.service';
import { TransactionFormDialogService } from '../features/transactions/transaction-form-dialog.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatMenuModule,
    MatDividerModule,
    MatSnackBarModule,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  private readonly meApi = inject(MeApiService);
  private readonly router = inject(Router);
  private readonly txDialog = inject(TransactionFormDialogService);
  private readonly snack = inject(MatSnackBar);

  readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  readonly pageTitle = computed(() => {
    const u = this.url();
    if (u.startsWith('/dashboard')) return 'Visão geral';
    if (u.startsWith('/metas')) return 'Metas de orçamento';
    if (u.startsWith('/transactions')) return 'Transações';
    if (u.startsWith('/categories')) return 'Categorias';
    if (u.includes('/contas/extrato')) return 'Extrato de contas';
    if (u.startsWith('/contas')) return 'Contas';
    if (u.startsWith('/settings')) return 'Configurações da conta e plano';
    return 'Finanças';
  });

  readonly showTipBanner = computed(() => !this.url().split('?')[0].startsWith('/settings'));

  readonly showSubscribeCta = computed(() => this.url().split('?')[0].startsWith('/settings'));

  /** FAB global oculto em `/contas` (FAB local) e em `/categories` (FAB local de nova categoria). */
  readonly showGlobalTransactionFab = computed(() => {
    const path = this.url().split('?')[0];
    if (path === '/contas' || path === '/contas/') return false;
    if (path.startsWith('/categories')) return false;
    if (path.startsWith('/settings')) return false;
    return true;
  });

  readonly todayLabel = computed(() => {
    const d = new Date();
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  });

  readonly fabMenuOpen = signal(false);

  private fabCloseTimer: ReturnType<typeof setTimeout> | null = null;

  /** Iniciais para avatares (2 letras se nome composto). */
  readonly userInitials = computed(() => initialsFromDisplayName(this.auth.userDisplayName()));
  readonly userMenuDisplayName = computed(() => toTitleCaseName(this.auth.userDisplayName()));

  ngOnInit(): void {
    if (!this.auth.isAuthenticated()) return;
    this.meApi.me().subscribe({
      next: (me) => this.auth.hydrateFromMeResponse(me),
      error: () => {},
    });
  }

  ngOnDestroy(): void {
    this.clearFabCloseTimer();
  }

  openFabMenu(): void {
    this.clearFabCloseTimer();
    this.fabMenuOpen.set(true);
  }

  scheduleCloseFabMenu(): void {
    this.clearFabCloseTimer();
    this.fabCloseTimer = setTimeout(() => {
      this.fabMenuOpen.set(false);
      this.fabCloseTimer = null;
    }, 220);
  }

  private clearFabCloseTimer(): void {
    if (this.fabCloseTimer != null) {
      clearTimeout(this.fabCloseTimer);
      this.fabCloseTimer = null;
    }
  }

  logout(): void {
    this.auth.logout();
  }

  comingSoon(label: string): void {
    this.snack.open(`${label} — disponível em breve.`, 'OK', { duration: 3200 });
  }

  openFabExpense(): void {
    this.txDialog.openExpense({ initialKind: 'EXPENSE' }).subscribe();
  }

  openFabIncome(): void {
    this.txDialog.openExpense({ initialKind: 'INCOME' }).subscribe();
  }

  onUserMenuOpened(): void {
    if (typeof document === 'undefined') return;
    const panel = document.querySelector('.shell-user-menu-panel');
    if (!panel) return;
    const pane = panel.closest('.cdk-overlay-pane') as HTMLElement | null;
    if (!pane) return;
    pane.style.zIndex = '81';
    pane.style.transform = 'translateX(-30px) translateY(10px)';
    pane.style.top = '44.375px';
    pane.style.left = '1043px';
  }
}

function initialsFromDisplayName(name: string): string {
  const t = name.trim();
  if (!t) return '?';
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0][0];
    const b = parts[parts.length - 1][0];
    if (a && b) return `${a}${b}`.toUpperCase();
  }
  return t.slice(0, 2).toUpperCase();
}

function toTitleCaseName(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase('pt-BR')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase('pt-BR') + part.slice(1))
    .join(' ');
}
