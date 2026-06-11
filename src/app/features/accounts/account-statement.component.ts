import { DatePipe, DecimalPipe } from '@angular/common';
import { catchError, of } from 'rxjs';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map, startWith } from 'rxjs/operators';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TransactionResponse } from '../../core/models/transaction.models';
import { AccountApiService } from '../../core/services/account-api.service';
import { TransactionApiService } from '../../core/services/transaction-api.service';
import { TransactionFormDialogService } from '../transactions/transaction-form-dialog.service';
import { TransactionDetailsDialogComponent } from '../transactions/transaction-details-dialog.component';
import { uiAccountFromApi } from './account-api.mapper';
import { AccountFormDialogService } from './account-form-dialog.service';
import type { UiAccount } from './account.models';

export interface SituationRow {
  label: string;
  confirmed: number;
  projected: number;
  tone: 'neutral' | 'income' | 'expense' | 'result';
}

/** Linha do extrato: movimento real ou saldo inicial sintético no mês. */
export type StatementLine =
  | {
      kind: 'opening';
      sortKey: string;
      delta: number;
      run: number;
      dateLabel: string;
      desc: string;
    }
  | {
      kind: 'tx';
      sortKey: string;
      tx: TransactionResponse;
      delta: number;
      run: number;
      dateLabel: string;
      desc: string;
    };

@Component({
  selector: 'app-account-statement',
  standalone: true,
  imports: [
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    DecimalPipe,
    DatePipe,
  ],
  templateUrl: './account-statement.component.html',
  styleUrl: './account-statement.component.scss',
})
export class AccountStatementComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly txApi = inject(TransactionApiService);
  private readonly txDialog = inject(TransactionFormDialogService);
  private readonly dialog = inject(MatDialog);
  private readonly accountDialog = inject(AccountFormDialogService);
  private readonly accountApi = inject(AccountApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly accountKey = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('accountKey') ?? 'principal')),
    { initialValue: this.route.snapshot.paramMap.get('accountKey') ?? 'principal' },
  );

  readonly accountMeta = signal<UiAccount | null>(null);

  readonly accountLabel = computed(() => this.accountMeta()?.name ?? 'Conta');

  readonly viewYear = signal(new Date().getFullYear());
  readonly viewMonth = signal(new Date().getMonth() + 1);

  readonly loading = signal(true);
  readonly printing = signal(false);
  readonly transactions = signal<TransactionResponse[]>([]);
  readonly totalElements = signal(0);
  readonly printLines = signal<StatementLine[]>([]);
  readonly printedAt = signal<Date | null>(null);

  readonly monthNavLabel = computed(() => {
    const d = new Date(this.viewYear(), this.viewMonth() - 1, 1);
    return d
      .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      .replace(/^\w/, (c) => c.toUpperCase());
  });

  readonly monthStartDdMm = computed(() => {
    const d = new Date(this.viewYear(), this.viewMonth() - 1, 1);
    return formatDdMmFromDate(d);
  });

  /**
   * Painel lateral: receitas (incl. saldo inicial no mês), despesas em valor negativo,
   * resultado = receitas + despesas (soma algébrica), alinhado ao mock de extrato.
   */
  readonly situationRows = computed((): SituationRow[] => {
    const acc = this.accountMeta();
    const txs = this.transactions();
    const y = this.viewYear();
    const mo = this.viewMonth();
    if (!acc) return [];

    let txIncome = 0;
    let txExpense = 0;
    for (const t of txs) {
      if (t.kind === 'INCOME') txIncome += Number(t.amount);
      else txExpense += Number(t.amount);
    }

    const openingSigned = openingBalanceInViewMonth(acc, y, mo);
    const receitas = txIncome + Math.max(0, openingSigned);
    const despesasMag = txExpense + Math.max(0, -openingSigned);
    const despesasDisplay = -despesasMag;
    const prev = 0;
    const resultado = receitas + despesasDisplay;
    const finalBal = prev + resultado;

    return [
      { label: 'Saldo anterior', confirmed: prev, projected: prev, tone: 'neutral' },
      { label: 'Receitas', confirmed: receitas, projected: receitas, tone: 'income' },
      { label: 'Transferências de entrada', confirmed: 0, projected: 0, tone: 'neutral' },
      { label: 'Despesas', confirmed: despesasDisplay, projected: despesasDisplay, tone: 'expense' },
      { label: 'Transferências de saída', confirmed: 0, projected: 0, tone: 'neutral' },
      {
        label: 'Resultado',
        confirmed: resultado,
        projected: resultado,
        tone: resultado >= 0 ? 'result' : 'expense',
      },
      {
        label: 'Saldo final',
        confirmed: finalBal,
        projected: finalBal,
        tone: finalBal >= 0 ? 'result' : 'expense',
      },
    ];
  });

  readonly printSituation = computed(() => {
    const rows = this.situationRows();
    const find = (label: string) => rows.find((r) => r.label === label);
    return {
      receitas: find('Receitas')?.confirmed ?? 0,
      despesas: find('Despesas')?.confirmed ?? 0,
      resultado: find('Resultado')?.confirmed ?? 0,
      saldoFinal: find('Saldo final')?.confirmed ?? 0,
    };
  });

  readonly statementLines = computed((): StatementLine[] => this.buildStatementLines(this.transactions()));

  ngOnInit(): void {
    this.route.paramMap
      .pipe(startWith(this.route.snapshot.paramMap), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadAccountAndMonth());
    this.txDialog.transactionCommitted$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.loadMonthData());
    this.destroyRef.onDestroy(() => document.body.classList.remove('st-print-active'));
  }

  private buildStatementLines(txsSource: TransactionResponse[]): StatementLine[] {
    const acc = this.accountMeta();
    const txs = [...txsSource];
    const y = this.viewYear();
    const mo = this.viewMonth();
    const today = new Date().toISOString().slice(0, 10);

    const lines: StatementLine[] = [];

    const openingSigned = acc ? openingBalanceInViewMonth(acc, y, mo) : 0;
    if (acc && acc.initialBalanceDate && isYyyyMmDayInMonth(acc.initialBalanceDate, y, mo) && openingSigned !== 0) {
      const day = acc.initialBalanceDate.slice(0, 10);
      const sortKey = `${day}T00:00:00.000Z`;
      lines.push({
        kind: 'opening',
        sortKey,
        delta: openingSigned,
        run: 0,
        dateLabel: day === today ? 'hoje' : formatDdMmIso(day),
        desc: 'Saldo inicial',
      });
    }

    for (const tx of txs) {
      const delta = tx.kind === 'INCOME' ? Number(tx.amount) : -Number(tx.amount);
      const d = tx.occurredAt.slice(0, 10);
      lines.push({
        kind: 'tx',
        sortKey: tx.occurredAt,
        tx,
        delta,
        run: 0,
        dateLabel: d === today ? 'hoje' : formatDdMmIso(d),
        desc: (tx.description && tx.description.trim()) || tx.categoryName,
      });
    }

    lines.sort((a, b) => {
      const c = a.sortKey.localeCompare(b.sortKey);
      if (c !== 0) return c;
      if (a.kind === 'opening' && b.kind === 'tx') return -1;
      if (a.kind === 'tx' && b.kind === 'opening') return 1;
      if (a.kind === 'tx' && b.kind === 'tx') return a.tx.id - b.tx.id;
      return 0;
    });

    let run = 0;
    return lines.map((line) => {
      run += line.delta;
      return { ...line, run };
    });
  }

  shiftMonth(delta: number): void {
    const d = new Date(this.viewYear(), this.viewMonth() - 1 + delta, 1);
    this.viewYear.set(d.getFullYear());
    this.viewMonth.set(d.getMonth() + 1);
    this.loadMonthData();
  }

  goTodayMonth(): void {
    const n = new Date();
    this.viewYear.set(n.getFullYear());
    this.viewMonth.set(n.getMonth() + 1);
    this.loadMonthData();
  }

  private loadAccountAndMonth(): void {
    const key = this.accountKey();
    this.loading.set(true);
    this.accountApi.getByPublicKey(key).subscribe({
      next: (r) => {
        this.accountMeta.set(uiAccountFromApi(r));
        this.loadMonthData();
      },
      error: () => {
        this.loading.set(false);
        void this.router.navigate(['/contas', 'extrato', 'principal'], { replaceUrl: true });
      },
    });
  }

  private loadMonthData(): void {
    if (!this.accountMeta()) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    const y = this.viewYear();
    const mo = this.viewMonth();
    const start = new Date(y, mo - 1, 1);
    const end = new Date(y, mo, 0, 23, 59, 59, 999);
    const accPk = this.accountKey();
    this.txApi
      .list({
        page: 0,
        size: 500,
        from: start.toISOString(),
        to: end.toISOString(),
        accountPublicKey: accPk,
      })
      .subscribe({
        next: (txs) => {
          this.transactions.set(txs.content);
          this.totalElements.set(txs.totalElements);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  editAccount(): void {
    const acc = this.accountMeta();
    if (!acc) return;
    this.accountDialog.openEdit({ account: { ...acc } }).subscribe((saved) => {
      if (saved) this.loadAccountAndMonth();
    });
  }

  toneClass(tone: SituationRow['tone']): string {
    if (tone === 'income' || tone === 'result') return 'st-num--pos';
    if (tone === 'expense') return 'st-num--neg';
    return '';
  }

  amountClass(delta: number): string {
    if (delta > 0) return 'st-num--pos';
    if (delta < 0) return 'st-num--neg';
    return '';
  }

  filterSoon(): void {
    window.alert('Filtros do extrato em breve (MVP).');
  }

  exportCsv(): void {
    const lines = ['Data;Descrição;Tipo;Valor'];
    for (const row of this.statementLines()) {
      if (row.kind === 'opening') {
        const day = row.sortKey.slice(0, 10);
        lines.push(`${formatDdMmIso(day)};${csvEsc(row.desc)};SALDO_INICIAL;${String(row.delta)}`);
      } else {
        const t = row.tx;
        lines.push(
          `${formatDdMmIso(t.occurredAt.slice(0, 10))};${csvEsc(row.desc)};${t.kind};${String(row.delta)}`,
        );
      }
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `extrato-${this.accountKey()}-${this.viewYear()}-${String(this.viewMonth()).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  printDateLabel(line: StatementLine): string {
    const day = line.sortKey.slice(0, 10);
    if (day.length < 10) return line.dateLabel;
    return formatDdMmIso(day);
  }

  printDescription(line: StatementLine): string {
    if (line.kind === 'opening') return line.desc;
    const primary = this.primaryDescription(line.tx);
    if (primary) return `${primary} · ${line.tx.categoryName}`;
    return line.desc;
  }

  printView(): void {
    if (this.printing() || this.loading()) return;

    const y = this.viewYear();
    const mo = this.viewMonth();
    const start = new Date(y, mo - 1, 1);
    const end = new Date(y, mo, 0, 23, 59, 59, 999);
    const needAll = this.totalElements() > this.transactions().length;

    const runPrint = (monthTxs: TransactionResponse[]) => {
      this.printLines.set(this.buildStatementLines(monthTxs));
      this.printedAt.set(new Date());
      document.body.classList.add('st-print-active');

      const cleanup = () => {
        document.body.classList.remove('st-print-active');
        this.printing.set(false);
        window.removeEventListener('afterprint', cleanup);
      };
      window.addEventListener('afterprint', cleanup);

      setTimeout(() => window.print(), 0);
    };

    if (!needAll) {
      this.printing.set(true);
      runPrint(this.transactions());
      return;
    }

    this.printing.set(true);
    this.txApi
      .list({
        page: 0,
        size: 5000,
        from: start.toISOString(),
        to: end.toISOString(),
        accountPublicKey: this.accountKey(),
      })
      .pipe(catchError(() => of({ content: this.transactions(), totalElements: this.transactions().length })))
      .subscribe({
        next: (page) => runPrint(page.content),
        error: () => this.printing.set(false),
      });
  }

  openDetails(tx: TransactionResponse): void {
    const title = this.primaryDescription(tx) ?? tx.categoryName ?? `Lançamento #${tx.id}`;
    this.dialog
      .open(TransactionDetailsDialogComponent, {
        width: 'min(96vw, 700px)',
        maxWidth: '96vw',
        panelClass: 'transaction-details-dialog-panel',
        backdropClass: 'define-goals-dialog-backdrop',
        data: { tx, title },
      })
      .afterClosed()
      .subscribe((result) => {
        if (result === 'edit') {
          this.txDialog.openExpense({ transactionId: tx.id }).subscribe();
        }
      });
  }

  primaryDescription(tx: TransactionResponse): string | null {
    if (tx.kind !== 'EXPENSE') return tx.description?.trim() || null;
    const raw = (tx.description ?? '').trim();
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

function isYyyyMmDayInMonth(isoDate: string, year: number, month: number): boolean {
  const day = isoDate.slice(0, 10);
  if (day.length < 10) return false;
  const [y, m] = day.split('-').map(Number);
  return y === year && m === month;
}

/** Saldo inicial com sinal, contabilizado só no mês da data de referência. */
function openingBalanceInViewMonth(acc: UiAccount, year: number, month: number): number {
  if (!acc.initialBalanceDate || !isYyyyMmDayInMonth(acc.initialBalanceDate, year, month)) return 0;
  const signed = acc.initialBalance != null ? Number(acc.initialBalance) : 0;
  return Number.isFinite(signed) ? signed : 0;
}

function formatDdMmIso(isoDay: string): string {
  const [y, m, d] = isoDay.split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

function formatDdMmFromDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function csvEsc(s: string): string {
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
