import { DecimalPipe } from '@angular/common';
import { catchError, of } from 'rxjs';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map, startWith } from 'rxjs/operators';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TransactionResponse } from '../../core/models/transaction.models';
import { AccountApiService } from '../../core/services/account-api.service';
import { TransactionApiService } from '../../core/services/transaction-api.service';
import { TransactionFormDialogService } from '../transactions/transaction-form-dialog.service';
import { uiAccountFromApi } from './account-api.mapper';
import { AccountFormDialogService } from './account-form-dialog.service';
import {
  CreditCardInvoiceSummary,
  computeCreditCardInvoiceSummary,
  formatBrDate,
  invoiceCycleForViewMonth,
  txDateLabel,
} from './credit-card-invoice.util';
import type { UiAccount } from './account.models';

@Component({
  selector: 'app-credit-card-invoice',
  standalone: true,
  imports: [
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatMenuModule,
    MatSnackBarModule,
    DecimalPipe,
  ],
  templateUrl: './credit-card-invoice.component.html',
  styleUrl: './credit-card-invoice.component.scss',
})
export class CreditCardInvoiceComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly txApi = inject(TransactionApiService);
  private readonly txDialog = inject(TransactionFormDialogService);
  private readonly accountDialog = inject(AccountFormDialogService);
  private readonly accountApi = inject(AccountApiService);
  private readonly snack = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  readonly accountKey = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('accountKey') ?? '')),
    { initialValue: this.route.snapshot.paramMap.get('accountKey') ?? '' },
  );

  readonly accountMeta = signal<UiAccount | null>(null);
  readonly viewYear = signal(new Date().getFullYear());
  readonly viewMonth = signal(new Date().getMonth() + 1);
  readonly loading = signal(true);
  readonly transactions = signal<TransactionResponse[]>([]);
  readonly summary = signal<CreditCardInvoiceSummary | null>(null);

  readonly monthNavLabel = computed(() => {
    const d = new Date(this.viewYear(), this.viewMonth() - 1, 1);
    return d
      .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      .replace(/^\w/, (c) => c.toUpperCase());
  });

  readonly expenseRows = computed(() =>
    this.transactions()
      .filter((t) => t.kind === 'EXPENSE')
      .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()),
  );

  readonly txDateLabel = txDateLabel;

  ngOnInit(): void {
    this.route.paramMap
      .pipe(startWith(this.route.snapshot.paramMap), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadAccountAndCycle());
    this.txDialog.transactionCommitted$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.loadCycleData());
  }

  shiftMonth(delta: number): void {
    let y = this.viewYear();
    let m = this.viewMonth() + delta;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    this.viewYear.set(y);
    this.viewMonth.set(m);
    this.loadCycleData();
  }

  goTodayMonth(): void {
    const now = new Date();
    this.viewYear.set(now.getFullYear());
    this.viewMonth.set(now.getMonth() + 1);
    this.loadCycleData();
  }

  editAccount(): void {
    const acc = this.accountMeta();
    if (!acc) return;
    this.accountDialog.openEdit({ account: { ...acc } }).subscribe((saved) => {
      if (saved) this.loadAccountAndCycle();
    });
  }

  openNewExpense(): void {
    this.txDialog.openExpense().subscribe();
  }

  actionSoon(label: string): void {
    this.snack.open(`${label} — disponível em breve.`, 'OK', { duration: 3200 });
  }

  formatDate(iso: string): string {
    return formatBrDate(iso);
  }

  private loadAccountAndCycle(): void {
    const key = this.accountKey();
    if (!key) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.accountApi.getByPublicKey(key).subscribe({
      next: (r) => {
        const acc = uiAccountFromApi(r);
        if (acc.accountType !== 'CREDIT_CARD') {
          this.loading.set(false);
          this.snack.open('Esta conta não é um cartão de crédito.', 'Fechar', { duration: 5000 });
          return;
        }
        this.accountMeta.set(acc);
        this.loadCycleData();
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('Cartão não encontrado.', 'Fechar', { duration: 5000 });
      },
    });
  }

  private loadCycleData(): void {
    const acc = this.accountMeta();
    if (!acc) return;
    const cycle = invoiceCycleForViewMonth(acc, this.viewYear(), this.viewMonth());
    if (!cycle) {
      this.summary.set(null);
      this.transactions.set([]);
      this.loading.set(false);
      return;
    }

    const from = new Date(cycle.periodStartIso);
    from.setHours(0, 0, 0, 0);
    const to = new Date(cycle.periodEndIso);
    to.setHours(23, 59, 59, 999);

    this.txApi
      .list({
        page: 0,
        size: 5000,
        from: from.toISOString(),
        to: to.toISOString(),
        accountPublicKey: acc.publicKey,
        includeProjected: true,
      })
      .pipe(catchError(() => of({ content: [] as TransactionResponse[], totalElements: 0 })))
      .subscribe({
        next: (page) => {
          this.transactions.set(page.content);
          this.summary.set(computeCreditCardInvoiceSummary(acc, page.content, cycle));
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }
}
