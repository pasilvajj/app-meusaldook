import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { TransactionApiService } from '../../core/services/transaction-api.service';
import { RecurringTransactionApiService } from '../../core/services/recurring-transaction-api.service';
import { AccountApiService } from '../../core/services/account-api.service';
import { TransactionResponse } from '../../core/models/transaction.models';
import { DecimalPipe, DatePipe } from '@angular/common';
import { TransactionFormDialogService } from './transaction-form-dialog.service';
import { TransactionDetailsDialogComponent } from './transaction-details-dialog.component';
import { installmentDeleteConfirmMessage } from './installment-utils';
import {
  canMarkExpensePaid,
  fixedExpenseDeleteConfirmMessage,
  isFixedExpense,
  markExpensePaid$,
  resolveExpenseEditDialogData,
} from './fixed-expense-utils';
import { uiAccountFromApi } from '../accounts/account-api.mapper';
import type { UiAccount } from '../accounts/account.models';

type TxUiStatus = 'PENDENTE' | 'AGENDADO' | 'CONFIRMADO' | 'CONCILIADO';

type LedgerKind = 'prior-balance' | 'opening-balance' | 'tx';

export interface LedgerRowView {
  kind: LedgerKind;
  sortKey: string;
  occurredAtIso: string;
  signedAmount: number | null;
  balance: number;
  tx?: TransactionResponse;
  titleLine: string;
  subtitle?: string;
  categoryLabel?: string;
  /** Saldo transportado no fim do mês anterior (linha «Saldo anterior» antes das transações do mês). */
  priorCarryBalance?: number;
}

function openingBalanceInViewMonth(acc: UiAccount, year: number, month: number): number {
  if (!acc.initialBalanceDate || !isYyyyMmDayInMonth(acc.initialBalanceDate, year, month)) return 0;
  const signed = acc.initialBalance != null ? Number(acc.initialBalance) : 0;
  return Number.isFinite(signed) ? signed : 0;
}

function isYyyyMmDayInMonth(isoDate: string, year: number, month: number): boolean {
  const day = isoDate.slice(0, 10);
  if (day.length < 10) return false;
  const [y, m] = day.split('-').map(Number);
  return y === year && m === month;
}

function isoDayOnly(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function ledgerAnchorStart(acc: UiAccount | null): Date {
  if (acc?.initialBalanceDate) {
    const [yy, mm] = acc.initialBalanceDate.slice(0, 10).split('-').map(Number);
    return new Date(yy, mm - 1, 1);
  }
  return new Date(2000, 0, 1);
}

/** Saldo acumulado até ao último instante do mês anterior ao `focus` (inclui saldo inicial da conta se já ocorrido). */
function computeBalanceAtEndOfPreviousMonth(focus: Date, acc: UiAccount | null, txsThroughPrevEnd: TransactionResponse[]): number {
  const y = focus.getFullYear();
  const m = focus.getMonth() + 1;
  let py = y;
  let pm = m - 1;
  if (pm < 1) {
    pm = 12;
    py -= 1;
  }
  const end = new Date(py, pm, 0, 23, 59, 59, 999);
  const endMs = end.getTime();

  type Ev = { sk: string; d: number };
  const evs: Ev[] = [];

  for (const t of txsThroughPrevEnd) {
    const tMs = new Date(t.occurredAt).getTime();
    if (!Number.isFinite(tMs) || tMs > endMs) continue;
    const delta = t.kind === 'INCOME' ? Number(t.amount) : -Number(t.amount);
    if (Number.isFinite(delta)) evs.push({ sk: t.occurredAt, d: delta });
  }

  const ibd = acc?.initialBalanceDate?.slice(0, 10);
  if (acc && ibd) {
    const ibMs = new Date(`${ibd}T12:00:00`).getTime();
    if (Number.isFinite(ibMs) && ibMs <= endMs) {
      const iy = Number(ibd.slice(0, 4));
      const im = Number(ibd.slice(5, 7));
      const opening = openingBalanceInViewMonth(acc, iy, im);
      if (opening !== 0) evs.push({ sk: `${ibd}T00:00:00.000Z`, d: opening });
    }
  }

  evs.sort((a, b) => a.sk.localeCompare(b.sk));
  return evs.reduce((s, e) => s + e.d, 0);
}

function lastDayOfPreviousMonthIso(focus: Date): string {
  const d = new Date(focus.getFullYear(), focus.getMonth(), 0);
  return isoDayOnly(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function ledgerSortCmp(a: Omit<LedgerRowView, 'balance'>, b: Omit<LedgerRowView, 'balance'>): number {
  const c = a.sortKey.localeCompare(b.sortKey);
  if (c !== 0) return c;
  if (a.kind === 'opening-balance' && b.kind === 'tx') return -1;
  if (a.kind === 'tx' && b.kind === 'opening-balance') return 1;
  if (a.kind === 'tx' && b.kind === 'tx' && a.tx && b.tx) return a.tx.id - b.tx.id;
  return 0;
}

@Component({
  selector: 'app-transaction-list',
  standalone: true,
  imports: [
    MatTableModule,
    MatButtonModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    MatSnackBarModule,
    DecimalPipe,
    DatePipe,
  ],
  templateUrl: './transaction-list.component.html',
  styleUrl: './transaction-list.component.scss',
})
export class TransactionListComponent implements OnInit {
  private readonly api = inject(TransactionApiService);
  private readonly recurringApi = inject(RecurringTransactionApiService);
  private readonly accountApi = inject(AccountApiService);
  private readonly txDialog = inject(TransactionFormDialogService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  readonly displayedColumns = ['occurredAt', 'description', 'status', 'amount', 'actions', 'balance'] as const;
  readonly rows = signal<TransactionResponse[]>([]);
  /** Movimentos desde o mês de referência do saldo inicial até ao fim do mês anterior (para calcular carry-over). */
  readonly txsThroughPriorMonthEnd = signal<TransactionResponse[]>([]);
  readonly principalAccount = signal<UiAccount | null>(null);
  readonly loading = signal(true);
  readonly totalElements = signal(0);
  readonly pageSize = signal(20);
  readonly pageIndex = signal(0);
  readonly focusDate = signal(new Date());
  readonly expandedView = signal(false);
  readonly printing = signal(false);
  readonly printLedgerRows = signal<LedgerRowView[]>([]);
  readonly printedAt = signal<Date | null>(null);
  readonly printTotals = signal({ income: 0, expense: 0, result: 0 });

  readonly periodLabel = computed(() =>
    this.focusDate()
      .toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
      .replace(/\.$/, ''),
  );

  readonly printPeriodTitle = computed(() => {
    const d = this.focusDate();
    const month = d.toLocaleDateString('pt-BR', { month: 'long' });
    return `${month.charAt(0).toUpperCase() + month.slice(1)} de ${d.getFullYear()}`;
  });

  readonly displayRows = computed(() => this.buildLedgerRows());

  readonly accountRows = computed(() => {
    const agg = new Map<string, number>();
    const acc = this.principalAccount();
    const f = this.focusDate();
    const y = f.getFullYear();
    const mo = f.getMonth() + 1;
    const ibd = acc?.initialBalanceDate?.slice(0, 10);
    const openingSigned = acc ? openingBalanceInViewMonth(acc, y, mo) : 0;
    const openingInMonth = !!(acc && ibd && isYyyyMmDayInMonth(ibd, y, mo) && openingSigned !== 0);

    if (acc && openingSigned !== 0 && openingInMonth) {
      const key = acc.name || 'Conta principal';
      agg.set(key, (agg.get(key) ?? 0) + openingSigned);
    }
    if (acc && !openingInMonth) {
      const carry = computeBalanceAtEndOfPreviousMonth(f, acc, this.txsThroughPriorMonthEnd());
      if (Math.abs(carry) > 1e-9) {
        const key = acc.name || 'Conta principal';
        agg.set(key, (agg.get(key) ?? 0) + carry);
      }
    }
    for (const tx of this.rows()) {
      const key = tx.accountName || 'Conta principal';
      agg.set(key, (agg.get(key) ?? 0) + this.signedAmount(tx));
    }
    const rows = [...agg.entries()]
      .map(([name, total]) => ({ name, confirmed: total, projected: total }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt'));
    const totalConfirmed = rows.reduce((s, r) => s + r.confirmed, 0);
    const totalProjected = rows.reduce((s, r) => s + r.projected, 0);
    return { rows, totalConfirmed, totalProjected };
  });

  readonly incomeTotal = computed(() => {
    const txIncome = this.rows()
      .filter((r) => r.kind === 'INCOME')
      .reduce((s, r) => s + r.amount, 0);
    const acc = this.principalAccount();
    const opening = acc ? openingBalanceInViewMonth(acc, this.focusDate().getFullYear(), this.focusDate().getMonth() + 1) : 0;
    return txIncome + Math.max(0, opening);
  });

  readonly expenseTotal = computed(() => {
    const txExpense = this.rows()
      .filter((r) => r.kind === 'EXPENSE')
      .reduce((s, r) => s + r.amount, 0);
    const acc = this.principalAccount();
    const opening = acc ? openingBalanceInViewMonth(acc, this.focusDate().getFullYear(), this.focusDate().getMonth() + 1) : 0;
    return txExpense + Math.max(0, -opening);
  });

  /** Resultado = receitas − despesas (alinhado ao extrato quando há saldo inicial no mês). */
  readonly resultTotal = computed(() => this.incomeTotal() - this.expenseTotal());
  readonly transferInTotal = computed(() => 0);
  readonly transferOutTotal = computed(() => 0);
  readonly outgoingTotal = computed(() => this.expenseTotal() + this.transferOutTotal());

  ngOnInit(): void {
    this.load();
    this.txDialog.transactionCommitted$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load());
    this.destroyRef.onDestroy(() => document.body.classList.remove('tx-print-active'));
  }

  openNewTransactionModal(): void {
    this.txDialog.openExpense().subscribe();
  }

  load(): void {
    this.loading.set(true);
    const f = this.focusDate();
    const from = new Date(f.getFullYear(), f.getMonth(), 1);
    const to = new Date(f.getFullYear(), f.getMonth() + 1, 0, 23, 59, 59, 999);
    const prevEnd = new Date(f.getFullYear(), f.getMonth(), 0, 23, 59, 59, 999);

    forkJoin({
      page: this.api.list({
        page: this.pageIndex(),
        size: this.pageSize(),
        from: from.toISOString(),
        to: to.toISOString(),
        includeProjected: true,
      }),
      account: this.accountApi.getByPublicKey('principal').pipe(catchError(() => of(null))),
    })
      .pipe(
        switchMap(({ page, account }) => {
          const accUi = account ? uiAccountFromApi(account) : null;
          const anchor = ledgerAnchorStart(accUi);
          if (prevEnd.getTime() < anchor.getTime()) {
            return of({ page, account: accUi, hist: [] as TransactionResponse[] });
          }
          return this.api
            .list({
              page: 0,
              size: 5000,
              from: anchor.toISOString(),
              to: prevEnd.toISOString(),
            })
            .pipe(
              catchError(() => of({ content: [] as TransactionResponse[], totalElements: 0 })),
              map((h) => ({ page, account: accUi, hist: h.content })),
            );
        }),
      )
      .subscribe({
        next: ({ page, account, hist }) => {
          this.principalAccount.set(account);
          this.txsThroughPriorMonthEnd.set(hist);
          this.rows.set(page.content);
          this.totalElements.set(page.totalElements);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  printView(): void {
    if (this.printing()) return;

    const f = this.focusDate();
    const from = new Date(f.getFullYear(), f.getMonth(), 1);
    const to = new Date(f.getFullYear(), f.getMonth() + 1, 0, 23, 59, 59, 999);
    const needAll = this.totalElements() > this.rows().length;

    const runPrint = (monthTxs: TransactionResponse[]) => {
      this.printLedgerRows.set(this.buildLedgerRows(monthTxs));
      this.printTotals.set(this.computeMonthTotals(monthTxs));
      this.printedAt.set(new Date());
      document.body.classList.add('tx-print-active');

      const cleanup = () => {
        document.body.classList.remove('tx-print-active');
        this.printing.set(false);
        window.removeEventListener('afterprint', cleanup);
      };
      window.addEventListener('afterprint', cleanup);

      setTimeout(() => window.print(), 0);
    };

    if (!needAll) {
      this.printing.set(true);
      runPrint(this.rows());
      return;
    }

    this.printing.set(true);
    this.api
      .list({
        page: 0,
        size: 5000,
        from: from.toISOString(),
        to: to.toISOString(),
        includeProjected: true,
      })
      .pipe(catchError(() => of({ content: this.rows(), totalElements: this.rows().length })))
      .subscribe({
        next: (page) => runPrint(page.content),
        error: () => this.printing.set(false),
      });
  }

  printDescription(item: LedgerRowView): string {
    if (item.kind === 'prior-balance' || item.kind === 'opening-balance') {
      return item.subtitle ? `${item.titleLine} — ${item.subtitle}` : item.titleLine;
    }
    const parts: string[] = [];
    const desc = item.tx ? this.expenseDescriptionLabel(item.tx) : null;
    if (desc) parts.push(desc);
    else if (item.categoryLabel) parts.push(item.categoryLabel);
    if (item.titleLine) parts.push(item.titleLine);
    return parts.length ? parts.join(' · ') : '—';
  }

  private computeMonthTotals(monthTxs: TransactionResponse[]): { income: number; expense: number; result: number } {
    const acc = this.principalAccount();
    const y = this.focusDate().getFullYear();
    const mo = this.focusDate().getMonth() + 1;
    const opening = acc ? openingBalanceInViewMonth(acc, y, mo) : 0;
    const txIncome = monthTxs.filter((r) => r.kind === 'INCOME').reduce((s, r) => s + r.amount, 0);
    const txExpense = monthTxs.filter((r) => r.kind === 'EXPENSE').reduce((s, r) => s + r.amount, 0);
    const income = txIncome + Math.max(0, opening);
    const expense = txExpense + Math.max(0, -opening);
    return { income, expense, result: income - expense };
  }

  private buildLedgerRows(monthTxs?: TransactionResponse[]): LedgerRowView[] {
    const acc = this.principalAccount();
    const focus = this.focusDate();
    const y = focus.getFullYear();
    const mo = focus.getMonth() + 1;
    const openingSigned = acc ? openingBalanceInViewMonth(acc, y, mo) : 0;
    const ibd = acc?.initialBalanceDate?.slice(0, 10);
    const openingInMonth = !!(acc && ibd && isYyyyMmDayInMonth(ibd, y, mo) && openingSigned !== 0);

    const priorClosing = computeBalanceAtEndOfPreviousMonth(focus, acc, this.txsThroughPriorMonthEnd());
    const hasPriorCarry = !openingInMonth && Math.abs(priorClosing) > 1e-9;

    const sortable: Omit<LedgerRowView, 'balance'>[] = [];

    if (openingInMonth && acc && ibd) {
      // Sem linha «Saldo anterior»: com saldo inicial no mês não há transporte real; 0,00 confunde com o mock.
      sortable.push({
        kind: 'opening-balance',
        sortKey: `${ibd}T00:00:00.000Z`,
        occurredAtIso: `${ibd}T12:00:00`,
        signedAmount: openingSigned,
        titleLine: 'Saldo inicial',
        subtitle: acc.name,
      });
    } else if (hasPriorCarry) {
      const carryDay = lastDayOfPreviousMonthIso(focus);
      sortable.push({
        kind: 'prior-balance',
        sortKey: `${carryDay}T12:00:00.000Z`,
        occurredAtIso: `${carryDay}T12:00:00`,
        signedAmount: null,
        titleLine: 'Saldo anterior',
        priorCarryBalance: priorClosing,
      });
    }

    const txs = [...(monthTxs ?? this.rows())].sort(
      (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
    );
    for (const tx of txs) {
      sortable.push({
        kind: 'tx',
        sortKey: tx.occurredAt,
        occurredAtIso: tx.occurredAt,
        signedAmount: this.signedAmount(tx),
        tx,
        titleLine: tx.accountName,
        subtitle: undefined,
        categoryLabel: tx.categoryName,
      });
    }

    sortable.sort(ledgerSortCmp);

    let run = 0;
    return sortable.map((item) => {
      if (item.kind === 'prior-balance') {
        if (item.priorCarryBalance != null) {
          run = item.priorCarryBalance;
          return { ...item, balance: run };
        }
        return { ...item, balance: run };
      }
      const delta =
        item.signedAmount ??
        (item.tx ? this.signedAmount(item.tx) : 0);
      run += delta;
      return { ...item, balance: run };
    });
  }

  toggleExpandedView(): void {
    this.expandedView.update((v) => !v);
  }

  shiftMonth(delta: number): void {
    const d = this.focusDate();
    const next = new Date(d.getFullYear(), d.getMonth() + delta, d.getDate());
    this.focusDate.set(next);
    this.pageIndex.set(0);
    this.load();
  }

  onPage(ev: PageEvent): void {
    this.pageIndex.set(ev.pageIndex);
    this.pageSize.set(ev.pageSize);
    this.load();
  }

  markPaid(row: TransactionResponse): void {
    if (!canMarkExpensePaid(row)) return;
    markExpensePaid$(this.api, row).subscribe({
      next: () => this.load(),
      error: () => this.notifyActionError('Não foi possível marcar como paga.'),
    });
  }

  edit(row: TransactionResponse): void {
    const target = resolveExpenseEditDialogData(row);
    if (!target.recurringId && !target.transactionId) {
      alert('Não foi possível identificar esta despesa para edição.');
      return;
    }
    this.txDialog.openExpense(target).subscribe();
  }

  remove(row: TransactionResponse): void {
    if (isFixedExpense(row)) {
      if (!confirm(fixedExpenseDeleteConfirmMessage(row))) return;
      const req$ = row.recurringId
        ? this.recurringApi.delete(row.recurringId)
        : row.sourceTransactionId
          ? this.api.delete(row.sourceTransactionId)
          : row.id > 0
            ? this.api.delete(row.id)
            : null;
      if (!req$) return;
      req$.subscribe({
        next: () => this.load(),
        error: () => this.notifyActionError('Não foi possível excluir a despesa fixa.'),
      });
      return;
    }
    if (!confirm(installmentDeleteConfirmMessage(row))) return;
    this.api.delete(row.id).subscribe({
      next: () => this.load(),
      error: () => this.notifyActionError('Não foi possível excluir o lançamento.'),
    });
  }

  private notifyActionError(message: string): void {
    this.snack.open(message, 'Fechar', { duration: 6000 });
  }

  openDetails(row: TransactionResponse): void {
    const title = this.expenseDescriptionLabel(row) ?? row.categoryName ?? `Lançamento #${row.id}`;
    this.dialog
      .open(TransactionDetailsDialogComponent, {
        width: 'min(96vw, 700px)',
        maxWidth: '96vw',
        panelClass: 'transaction-details-dialog-panel',
        backdropClass: 'define-goals-dialog-backdrop',
        data: { tx: row, title },
      })
      .afterClosed()
      .subscribe((result) => {
        if (result === 'edit') this.edit(row);
      });
  }

  signedAmount(row: TransactionResponse): number {
    return row.kind === 'INCOME' ? Number(row.amount) : -Number(row.amount);
  }

  txStatus(row: TransactionResponse): TxUiStatus {
    if (row.paidAt) return 'CONFIRMADO';
    const when = new Date(row.occurredAt).getTime();
    const now = Date.now();
    if (row.projected || (Number.isFinite(when) && when > now)) return 'AGENDADO';
    if (row.kind === 'INCOME') return 'CONCILIADO';
    return 'PENDENTE';
  }

  txStatusIcon(row: TransactionResponse): string {
    switch (this.txStatus(row)) {
      case 'PENDENTE':
        return 'radio_button_unchecked';
      case 'AGENDADO':
        return 'event';
      case 'CONCILIADO':
        return 'done_all';
      default:
        return 'check';
    }
  }

  txStatusClass(row: TransactionResponse): string {
    switch (this.txStatus(row)) {
      case 'PENDENTE':
        return 'tx-status--pending';
      case 'AGENDADO':
        return 'tx-status--planned';
      case 'CONCILIADO':
        return 'tx-status--recon';
      default:
        return 'tx-status--ok';
    }
  }

  ledgerDateDotClass(item: LedgerRowView): string {
    switch (item.kind) {
      case 'prior-balance':
        return 'tx-dot--neutral';
      case 'opening-balance':
        return 'tx-dot--recon';
      default:
        if (!item.tx) return 'tx-dot--ok';
        switch (this.txStatus(item.tx)) {
          case 'PENDENTE':
            return 'tx-dot--pending';
          case 'AGENDADO':
            return 'tx-dot--planned';
          case 'CONCILIADO':
            return 'tx-dot--recon';
          default:
            return 'tx-dot--ok';
        }
    }
  }

  ledgerTxStatus(item: LedgerRowView): TxUiStatus {
    if (item.kind === 'opening-balance') return 'CONCILIADO';
    if (item.kind === 'prior-balance') return 'CONFIRMADO';
    return this.txStatus(item.tx!);
  }

  ledgerStatusIcon(item: LedgerRowView): string {
    const s = this.ledgerTxStatus(item);
    switch (s) {
      case 'PENDENTE':
        return 'radio_button_unchecked';
      case 'AGENDADO':
        return 'event';
      case 'CONCILIADO':
        return 'done_all';
      default:
        return 'check';
    }
  }

  ledgerStatusClass(item: LedgerRowView): string {
    const s = this.ledgerTxStatus(item);
    switch (s) {
      case 'PENDENTE':
        return 'tx-status--pending';
      case 'AGENDADO':
        return 'tx-status--planned';
      case 'CONCILIADO':
        return 'tx-status--recon';
      default:
        return 'tx-status--ok';
    }
  }

  ledgerShowStatusIcon(item: LedgerRowView): boolean {
    return item.kind !== 'prior-balance';
  }

  expenseDescriptionLabel(row: TransactionResponse): string | null {
    if (row.kind !== 'EXPENSE') return null;
    const raw = (row.description ?? '').trim();
    if (!raw) return null;
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => !!l && !l.startsWith('Tags:') && !l.startsWith('['));
    const first = lines[0] ?? '';
    if (!first) return null;
    return first.length > 42 ? `${first.slice(0, 42)}...` : first;
  }
}
