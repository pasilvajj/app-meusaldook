import { DecimalPipe } from '@angular/common';
import { catchError, forkJoin, of } from 'rxjs';
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
import { CloseInvoiceDialogService } from './close-invoice-dialog.service';
import { FutureInstallmentsDialogService } from './future-installments-dialog.service';
import { PostInvoicePaymentDialogService } from './post-invoice-payment-dialog.service';
import {
  CreditCardInvoiceSummary,
  computeCreditCardInvoiceSummary,
  findScheduledInvoicePayment,
  firstChargeDayForOpenInvoice,
  formatBrDate,
  formatLocalIsoDate,
  groupFutureInstallmentsByInvoice,
  invoiceCycleForListing,
  invoiceFutureInstallmentsQueryRange,
  invoicePaymentQueryRange,
  invoiceViewMonthFromAccount,
  isInvoicePaymentForCard,
  isInvoicePaymentInCycle,
  isInvoicePaymentTransaction,
  isTransactionInInvoiceCycle,
  isViewingOpenInvoiceMonth,
  localDayEndFromIso,
  localDayStartFromIso,
  txDateLabel,
} from './credit-card-invoice.util';
import type { UiAccount } from './account.models';
import { RecurringTransactionApiService } from '../../core/services/recurring-transaction-api.service';
import {
  fixedExpenseDeleteConfirmMessage,
  isFixedExpense,
  resolveExpenseEditDialogData,
} from '../transactions/fixed-expense-utils';
import {
  installmentDeleteConfirmMessage,
  formatTransactionDescriptionLabel,
} from '../transactions/installment-utils';

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
  private readonly recurringApi = inject(RecurringTransactionApiService);
  private readonly txDialog = inject(TransactionFormDialogService);
  private readonly accountDialog = inject(AccountFormDialogService);
  private readonly closeInvoiceDialog = inject(CloseInvoiceDialogService);
  private readonly futureInstallmentsDialog = inject(FutureInstallmentsDialogService);
  private readonly postPaymentDialog = inject(PostInvoicePaymentDialogService);
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
  readonly futureTransactions = signal<TransactionResponse[]>([]);
  readonly paymentTransactions = signal<TransactionResponse[]>([]);
  readonly summary = signal<CreditCardInvoiceSummary | null>(null);
  readonly menuTransaction = signal<TransactionResponse | null>(null);

  readonly monthNavLabel = computed(() => {
    const d = new Date(this.viewYear(), this.viewMonth() - 1, 1);
    return d
      .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      .replace(/^\w/, (c) => c.toUpperCase());
  });

  readonly isOpenInvoiceView = computed(() => {
    const acc = this.accountMeta();
    if (!acc) return false;
    return isViewingOpenInvoiceMonth(acc, this.viewYear(), this.viewMonth());
  });

  readonly expenseRows = computed(() => {
    const cycle = this.summary()?.cycle;
    return this.transactions()
      .filter(
        (t) =>
          t.kind === 'EXPENSE' &&
          (!cycle || isTransactionInInvoiceCycle(t, cycle)) &&
          !isInvoicePaymentTransaction(t),
      )
      .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
  });

  readonly invoiceListRows = computed(() => {
    const acc = this.accountMeta();
    const cycle = this.summary()?.cycle;
    const expenses = this.expenseRows().map((tx) => ({ kind: 'expense' as const, tx }));
    const payments =
      acc && cycle
        ? this.paymentTransactions()
            .filter(
              (t) =>
                !!t.paidAt &&
                isInvoicePaymentInCycle(t, acc.name, cycle, acc.publicKey),
            )
            .map((tx) => ({ kind: 'payment' as const, tx }))
        : [];
    return [...expenses, ...payments].sort(
      (a, b) => new Date(a.tx.occurredAt).getTime() - new Date(b.tx.occurredAt).getTime(),
    );
  });

  readonly txDateLabel = txDateLabel;

  txDescriptionLabel(tx: TransactionResponse): string {
    return formatTransactionDescriptionLabel(tx.description) ?? tx.categoryName;
  }

  ngOnInit(): void {
    this.route.paramMap
      .pipe(startWith(this.route.snapshot.paramMap), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadAccountAndCycle());
    this.txDialog.transactionCommitted$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      const acc = this.accountMeta();
      if (acc) this.syncViewToOpenInvoice(acc);
      this.loadCycleData();
    });
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
    const acc = this.accountMeta();
    const fromAccount = acc ? invoiceViewMonthFromAccount(acc) : null;
    if (fromAccount) {
      this.viewYear.set(fromAccount.year);
      this.viewMonth.set(fromAccount.month);
    } else {
      const now = new Date();
      this.viewYear.set(now.getFullYear());
      this.viewMonth.set(now.getMonth() + 1);
    }
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
    const acc = this.accountMeta();
    if (!acc) {
      this.txDialog.openExpense().subscribe();
      return;
    }
    const openView = invoiceViewMonthFromAccount(acc) ?? {
      year: this.viewYear(),
      month: this.viewMonth(),
    };
    const cycle = invoiceCycleForListing(acc, openView.year, openView.month);
    if (!cycle) {
      this.txDialog.openExpense({ initialAccountKey: acc.publicKey }).subscribe();
      return;
    }
    const chargeDay = firstChargeDayForOpenInvoice(acc);
    this.txDialog
      .openExpense({
        initialAccountKey: acc.publicKey,
        initialOccurredDate: chargeDay,
        creditCardInvoiceContext: {
          accountKey: acc.publicKey,
          periodStartIso: cycle.periodStartIso,
          periodEndIso: cycle.periodEndIso,
        },
      })
      .subscribe();
  }

  openPostPayment(): void {
    const acc = this.accountMeta();
    const s = this.summary();
    if (!acc || !s) return;

    const remaining = Math.max(0, Math.abs(s.amountToPay));
    if (remaining < 0.01) {
      this.snack.open('Não há valor pendente nesta fatura.', 'OK', { duration: 4000 });
      return;
    }

    const scheduled = findScheduledInvoicePayment(
      this.paymentTransactions(),
      acc.name,
      s.cycle,
      acc.publicKey,
    );
    this.postPaymentDialog
      .open({ account: acc, summary: s, scheduledPayment: scheduled ?? undefined })
      .subscribe((result) => {
        if (result?.paid) this.loadCycleData();
      });
  }

  openFutureInstallments(): void {
    const acc = this.accountMeta();
    const cycle = this.summary()?.cycle;
    if (!acc || !cycle) return;
    const groups = groupFutureInstallmentsByInvoice(acc, this.futureTransactions(), cycle);
    this.futureInstallmentsDialog.openFuture({ account: acc, groups }).subscribe();
  }

  openAnticipateInstallments(): void {
    const acc = this.accountMeta();
    const cycle = this.summary()?.cycle;
    if (!acc || !cycle) return;
    const groups = groupFutureInstallmentsByInvoice(acc, this.futureTransactions(), cycle);
    this.futureInstallmentsDialog
      .openAnticipate({ account: acc, groups, anticipateToIso: firstChargeDayForOpenInvoice(acc) })
      .subscribe((result) => {
        if (result?.anticipated) this.loadCycleData();
      });
  }

  openCloseInvoice(): void {
    const acc = this.accountMeta();
    const s = this.summary();
    if (!acc || !s) return;
    this.closeInvoiceDialog.open({ account: acc, summary: s }).subscribe((result) => {
      if (result?.closed) this.loadAccountAndCycle();
    });
  }

  actionSoon(label: string): void {
    this.snack.open(`${label} — disponível em breve.`, 'OK', { duration: 3200 });
  }

  canMutateTransaction(tx: TransactionResponse): boolean {
    return tx.id > 0 && !tx.projected;
  }

  selectMenuTransaction(tx: TransactionResponse): void {
    this.menuTransaction.set(tx);
  }

  editMenuTransaction(): void {
    const tx = this.menuTransaction();
    if (tx) this.editTransaction(tx);
  }

  removeMenuTransaction(): void {
    const tx = this.menuTransaction();
    if (tx) this.removeTransaction(tx);
  }

  editTransaction(tx: TransactionResponse): void {
    const target = resolveExpenseEditDialogData(tx);
    if (!target.recurringId && !target.transactionId) {
      this.snack.open('Não foi possível identificar este lançamento para edição.', 'OK', { duration: 4000 });
      return;
    }
    this.txDialog.openExpense(target).subscribe();
  }

  removeTransaction(tx: TransactionResponse): void {
    if (isFixedExpense(tx)) {
      if (!confirm(fixedExpenseDeleteConfirmMessage(tx))) return;
      const req$ = tx.recurringId
        ? this.recurringApi.delete(tx.recurringId)
        : tx.sourceTransactionId
          ? this.txApi.delete(tx.sourceTransactionId)
          : tx.id > 0
            ? this.txApi.delete(tx.id)
            : null;
      if (!req$) return;
      req$.subscribe({
        next: () => this.loadCycleData(),
        error: () => this.snack.open('Não foi possível excluir a despesa fixa.', 'Fechar', { duration: 5000 }),
      });
      return;
    }
    if (!confirm(installmentDeleteConfirmMessage(tx, 'Excluir este lançamento?'))) return;
    this.txApi.delete(tx.id).subscribe({
      next: () => this.loadCycleData(),
      error: () => this.snack.open('Não foi possível excluir o lançamento.', 'Fechar', { duration: 5000 }),
    });
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
        this.syncViewToOpenInvoice(acc);
        this.loadCycleData();
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('Cartão não encontrado.', 'Fechar', { duration: 5000 });
      },
    });
  }

  private syncViewToOpenInvoice(acc: UiAccount): void {
    const view = invoiceViewMonthFromAccount(acc);
    if (!view) return;
    this.viewYear.set(view.year);
    this.viewMonth.set(view.month);
  }

  private loadCycleData(): void {
    const acc = this.accountMeta();
    if (!acc) return;
    const year = this.viewYear();
    const month = this.viewMonth();
    const cycle = invoiceCycleForListing(acc, year, month);
    if (!cycle) {
      this.summary.set(null);
      this.transactions.set([]);
      this.loading.set(false);
      return;
    }

    const from = localDayStartFromIso(cycle.periodStartIso);
    const to = localDayEndFromIso(cycle.periodEndIso);
    const paymentRange = invoicePaymentQueryRange(cycle);
    const includeProjected = isViewingOpenInvoiceMonth(acc, year, month);
    const isOpen = includeProjected;
    // Sempre buscar parcelas futuras: elas comprometem o limite mesmo em faturas fechadas.
    const futureRange = invoiceFutureInstallmentsQueryRange(cycle);

    forkJoin({
      card: this.txApi
        .list({
          page: 0,
          size: 5000,
          from: from.toISOString(),
          to: to.toISOString(),
          accountPublicKey: acc.publicKey,
          includeProjected,
        })
        .pipe(catchError(() => of({ content: [] as TransactionResponse[], totalElements: 0 }))),
      futureCard: this.txApi
        .list({
          page: 0,
          size: 5000,
          from: futureRange.from.toISOString(),
          to: futureRange.to.toISOString(),
          accountPublicKey: acc.publicKey,
          includeProjected: true,
        })
        .pipe(catchError(() => of({ content: [] as TransactionResponse[], totalElements: 0 }))),
      payments: this.txApi
        .list({
          page: 0,
          size: 5000,
          from: paymentRange.from.toISOString(),
          to: paymentRange.to.toISOString(),
          kind: 'EXPENSE',
        })
        .pipe(catchError(() => of({ content: [] as TransactionResponse[], totalElements: 0 }))),
    }).subscribe({
      next: ({ card, futureCard, payments }) => {
        const cardPayments = payments.content.filter((t) =>
          isInvoicePaymentForCard(t, acc.name, acc.publicKey),
        );
        const inCycle = card.content.filter((t) => isTransactionInInvoiceCycle(t, cycle));
        this.transactions.set(inCycle);
        this.futureTransactions.set(futureCard.content);
        this.paymentTransactions.set(cardPayments);
        this.summary.set(
          computeCreditCardInvoiceSummary(
            acc,
            inCycle,
            cycle,
            cardPayments,
            futureCard.content,
            isOpen,
          ),
        );
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
