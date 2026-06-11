import { DatePipe, DecimalPipe, NgClass } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnDestroy,
  OnInit,
  ViewChild,
  afterNextRender,
  computed,
  inject,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ArcElement, Chart, registerables } from 'chart.js';
import { EMPTY, Subject } from 'rxjs';
import { catchError, startWith, switchMap } from 'rxjs/operators';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { DashboardApiService } from '../../core/services/dashboard-api.service';
import { TransactionApiService } from '../../core/services/transaction-api.service';
import { MonthlySummaryResponse } from '../../core/models/summary.models';
import { TransactionResponse } from '../../core/models/transaction.models';
import type { BudgetGoalMonthResponse } from '../../core/models/budget-goal.models';
import { TransactionFormDialogService } from '../transactions/transaction-form-dialog.service';
import { DashboardPayablesFabService } from '../../core/services/dashboard-payables-fab.service';
import { uiAccountFromApi } from '../accounts/account-api.mapper';
import type { UiAccount } from '../accounts/account.models';

Chart.register(...registerables);

interface BalanceRow {
  name: string;
  accountKey: string;
  confirmed: number;
  projected: number;
}

/** Resumo sob o gráfico de fluxo (mock). */
export interface FluxoCaixaResumo {
  saldoEmLabel: string;
  accountName: string;
  accountEnd: number;
  goalResidue: number;
  total: number;
}

/** Linha do cartão «Metas de despesas» com dados. */
export interface MetasDespesaRow {
  categoryName: string;
  meta: number;
  realizado: number;
  aRealizar: number;
  /** Percentagem consumida da meta (pode ultrapassar 100). */
  pct: number;
  /** Largura da barra (máx. 100%). */
  pctBar: number;
  barClass: 'metas-bar--full' | 'metas-bar--part' | 'metas-bar--empty';
}

export interface MetasDespesaTotal {
  meta: number;
  realizado: number;
  aRealizar: number;
  pct: number;
  pctBar: number;
  barClass: MetasDespesaRow['barClass'];
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    MatCardModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    MatDividerModule,
    MatTableModule,
    MatIconModule,
    MatMenuModule,
    MatCheckboxModule,
    RouterLink,
    DecimalPipe,
    DatePipe,
    NgClass,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit, OnDestroy {
  private readonly dashboardApi = inject(DashboardApiService);
  private readonly txApi = inject(TransactionApiService);
  private readonly txDialog = inject(TransactionFormDialogService);
  private readonly loadTrigger$ = new Subject<void>();
  private readonly payablesFab = inject(DashboardPayablesFabService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  @ViewChild('lineCanvas') private lineCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('donutCanvas') private donutCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('barCanvas') private barCanvas?: ElementRef<HTMLCanvasElement>;

  readonly loading = signal(true);
  readonly data = signal<MonthlySummaryResponse | null>(null);
  readonly label = signal('');
  readonly balanceRows = signal<BalanceRow[]>([]);
  readonly displayedBalanceColumns = ['name', 'confirmed', 'projected'] as const;
  readonly principalAccount = signal<UiAccount | null>(null);
  readonly fluxoResumo = signal<FluxoCaixaResumo | null>(null);
  /** Mês do contexto do dashboard (ex.: «maio») para o texto do cartão de metas. */
  readonly metasMesNome = signal('');
  readonly metasDespesaRows = signal<MetasDespesaRow[]>([]);
  readonly metasDespesaTotals = signal<MetasDespesaTotal | null>(null);
  /** Despesas com data de lançamento no futuro (agendadas / a pagar). */
  readonly contasAPagar = signal<TransactionResponse[]>([]);

  /** Soma dos montantes a pagar (valores positivos na API). */
  readonly contasAPagarTotal = computed(() =>
    this.contasAPagar().reduce((s, t) => s + (Number(t.amount) || 0), 0),
  );

  /** Receitas com data de lançamento no futuro (agendadas / a receber). */
  readonly contasAReceber = signal<TransactionResponse[]>([]);

  /** Soma dos montantes a receber. */
  readonly contasAReceberTotal = computed(() =>
    this.contasAReceber().reduce((s, t) => s + (Number(t.amount) || 0), 0),
  );

  private charts: Chart[] = [];
  private chartsHostAlive = true;

  ngOnInit(): void {
    this.loadTrigger$
      .pipe(
        startWith(void 0),
        switchMap(() => {
          if (this.data() === null) {
            this.loading.set(true);
          }
          const now = new Date();
          const year = now.getFullYear();
          const month = now.getMonth() + 1;
          this.label.set(
            now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^\w/, (c) => c.toUpperCase()),
          );
          const mesLongo = now.toLocaleDateString('pt-BR', { month: 'long' });
          this.metasMesNome.set(mesLongo.replace(/^\w/, (c) => c.toLowerCase()));

          return this.dashboardApi.load(year, month, 'principal').pipe(
            catchError(() => {
              this.payablesFab.setHasFuturePayables(false);
              this.contasAReceber.set([]);
              this.loading.set(false);
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (payload) => {
          const summary = payload.summary;
          const goals = payload.goals;
          const uiAcc = payload.account ? uiAccountFromApi(payload.account) : null;

          this.data.set(summary);
          this.principalAccount.set(uiAcc);

          const goalResidue = computeGoalResidue(goals, summary.byCategory);
          const { labels, values, accountEnd } = buildCashflowSeries(
            new Date().getFullYear(),
            new Date().getMonth() + 1,
            payload.monthTransactions,
            uiAcc,
            goalResidue,
          );
          const year = new Date().getFullYear();
          const month = new Date().getMonth() + 1;
          const lastDay = new Date(year, month, 0).getDate();
          const saldoEmLabel = formatSaldoEmLabel(year, month, lastDay);

          this.fluxoResumo.set({
            saldoEmLabel,
            accountName: uiAcc?.name ?? 'Conta principal',
            accountEnd,
            goalResidue,
            total: accountEnd + goalResidue,
          });

          this.balanceRows.set([
            {
              name: uiAcc?.name ?? 'Conta principal',
              accountKey: uiAcc?.publicKey ?? 'principal',
              confirmed: accountEnd,
              projected: accountEnd + goalResidue,
            },
          ]);

          const mRows = buildMetasDespesaRows(goals, summary.byCategory);
          this.metasDespesaRows.set(mRows);
          this.metasDespesaTotals.set(mRows.length ? computeMetasTotals(mRows) : null);

          const aPagar = [...payload.scheduledPayables].sort(
            (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
          );
          this.contasAPagar.set(aPagar);
          this.payablesFab.setHasFuturePayables(aPagar.length > 0);

          const aReceber = [...payload.scheduledReceivables].sort(
            (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
          );
          this.contasAReceber.set(aReceber);

          this.loading.set(false);
          runInInjectionContext(this.injector, () => {
            afterNextRender(() => {
              if (!this.chartsHostAlive) return;
              this.paintCharts(summary, labels, values, goalResidue);
            });
          });
        },
      });

    this.txDialog.transactionCommitted$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.loadDashboard());
  }

  openNewTransactionModal(): void {
    this.txDialog.openExpense().subscribe();
  }

  openNewIncomeModal(): void {
    this.txDialog.openSimple({ initialKind: 'INCOME' }).subscribe();
  }

  editPayable(row: TransactionResponse): void {
    this.txDialog.openExpense({ transactionId: row.id }).subscribe();
  }

  editReceivable(row: TransactionResponse): void {
    this.txDialog.openSimple({ transactionId: row.id, initialKind: 'INCOME' }).subscribe();
  }

  removePayable(row: TransactionResponse): void {
    if (!confirm('Eliminar esta despesa agendada?')) return;
    this.txApi.delete(row.id).subscribe(() => this.loadDashboard());
  }

  removeReceivable(row: TransactionResponse): void {
    if (!confirm('Eliminar esta receita agendada?')) return;
    this.txApi.delete(row.id).subscribe(() => this.loadDashboard());
  }

  private loadDashboard(): void {
    this.loadTrigger$.next();
  }

  ngOnDestroy(): void {
    this.chartsHostAlive = false;
    this.destroyCharts();
    this.payablesFab.setHasFuturePayables(false);
  }

  private destroyCharts(): void {
    this.charts.forEach((c) => c.destroy());
    this.charts = [];
  }

  private paintCharts(
    summary: MonthlySummaryResponse,
    cashLabels: string[],
    cashValues: number[],
    goalResidue: number,
  ): void {
    if (!this.chartsHostAlive) return;
    this.destroyCharts();
    const line = this.lineCanvas?.nativeElement;
    const donut = this.donutCanvas?.nativeElement;
    const bar = this.barCanvas?.nativeElement;

    const teal = '#0d9488';
    const red = '#dc2626';
    const pink = '#db2777';
    const grid = 'rgba(15, 23, 42, 0.06)';

    if (line && cashLabels.length && cashValues.length) {
      const minV = Math.min(...cashValues, 0);
      const maxV = Math.max(...cashValues, 0);
      const span = maxV - minV || 1;
      const pad = Math.max(span * 0.12, 200);
      this.charts.push(
        new Chart(line, {
          type: 'line',
          data: {
            labels: cashLabels,
            datasets: [
              {
                label: 'Saldo acumulado (mês)',
                data: cashValues,
                borderColor: teal,
                backgroundColor: 'rgba(13, 148, 136, 0.18)',
                fill: true,
                tension: 0.25,
                pointRadius: 3,
                pointHoverRadius: 5,
                borderWidth: 2,
                segment: {
                  borderColor: (ctx) => {
                    if (goalResidue === 0) return teal;
                    const j = ctx.p1DataIndex;
                    return j === cashValues.length - 1 ? red : teal;
                  },
                },
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: { display: true, position: 'bottom' },
              tooltip: {
                callbacks: {
                  label: (ctx) => {
                    const v = ctx.raw as number;
                    return ` ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                  },
                },
              },
            },
            scales: {
              x: { grid: { color: grid }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
              y: {
                grid: { color: grid },
                suggestedMin: minV - pad,
                suggestedMax: maxV + pad,
              },
            },
          },
        }),
      );
    }

    if (donut) {
      const cats = summary.byCategory.filter((c) => c.total !== 0);
      const donutLabels = cats.map((c) => c.categoryName);
      const donutData = cats.map((c) => Math.abs(c.total));
      const palette = this.chartPalette;

      this.charts.push(
        new Chart<'doughnut'>(donut, {
          type: 'doughnut',
          data: {
            labels: donutLabels.length ? donutLabels : ['Sem dados'],
            datasets: [
              {
                data: donutData.length ? donutData : [1],
                backgroundColor: donutLabels.length ? palette.slice(0, donutLabels.length) : ['#cbd5e1'],
                borderWidth: 0,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (ctx) => {
                    const raw = ctx.raw as number;
                    const arr = (ctx.dataset.data as number[]).filter((n) => typeof n === 'number');
                    const sum = arr.reduce((a, b) => a + b, 0);
                    const pct = sum ? (raw / sum) * 100 : 0;
                    const pctStr = pct.toLocaleString('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
                    return ` ${pctStr}% (${raw.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
                  },
                },
              },
            },
          },
          plugins: [this.donutSlicePercentPlugin()],
        }),
      );
    }

    if (bar) {
      const income = summary.byKind.find((k) => k.kind === 'INCOME')?.total ?? 0;
      const expense = Math.abs(summary.byKind.find((k) => k.kind === 'EXPENSE')?.total ?? 0);
      this.charts.push(
        new Chart(bar, {
          type: 'bar',
          data: {
            labels: ['Receitas', 'Despesas'],
            datasets: [
              {
                data: [income, expense],
                backgroundColor: [teal, pink],
                borderRadius: 10,
                borderSkipped: false,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { display: false } },
              y: { grid: { color: grid } },
            },
          },
        }),
      );
    }
  }

  private donutSlicePercentPlugin() {
    return {
      id: 'donutSlicePct',
      afterDatasetsDraw: (chart: Chart<'doughnut'>) => {
        const meta = chart.getDatasetMeta(0);
        const data = chart.data.datasets[0]?.data as number[] | undefined;
        if (!meta?.data?.length || !data?.length) return;
        const total = data.reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
        if (!total || (data.length === 1 && chart.data.labels?.[0] === 'Sem dados')) return;

        const { ctx } = chart;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.font = '600 11px var(--font-body, system-ui, sans-serif)';
        meta.data.forEach((element, i) => {
          const v = data[i];
          if (typeof v !== 'number' || v <= 0 || v / total < 0.04) return;
          const arc = element as ArcElement;
          const angle = (arc.startAngle + arc.endAngle) / 2;
          const r = (arc.innerRadius + arc.outerRadius) / 2;
          const x = arc.x + Math.cos(angle) * r;
          const y = arc.y + Math.sin(angle) * r;
          const pct = ((v / total) * 100).toLocaleString('pt-BR', {
            maximumFractionDigits: 2,
            minimumFractionDigits: 2,
          });
          ctx.fillText(`${pct}%`, x, y);
        });
        ctx.restore();
      },
    };
  }

  readonly chartPalette = ['#0d9488', '#2563eb', '#d97706', '#a855f7', '#db2777', '#0ea5e9', '#64748b'] as const;

  donutCategories(d: MonthlySummaryResponse): { categoryName: string; total: number }[] {
    return d.byCategory.filter((c) => c.total !== 0);
  }

  categorySharePct(d: MonthlySummaryResponse, row: { total: number }): string {
    const cats = this.donutCategories(d);
    const sum = cats.reduce((s, c) => s + Math.abs(c.total), 0);
    if (!sum) return '0';
    const pct = (Math.abs(row.total) / sum) * 100;
    return pct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  donutCategoriesTotal(d: MonthlySummaryResponse): number {
    return this.donutCategories(d).reduce((s, c) => s + c.total, 0);
  }

  legendColor(i: number): string {
    return this.chartPalette[i % this.chartPalette.length] ?? '#94a3b8';
  }

  /** BRL no cartão «Despesas por categoria»: vírgula decimal e espaço fino nos milhares (como no mock). */
  formatDonutBrl(value: number): string {
    const v = Number.isFinite(value) ? value : 0;
    const abs = Math.abs(v);
    const s = abs.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const spaced = s.replace(/\./g, '\u202f');
    return v < 0 ? `−${spaced}` : spaced;
  }

  incomeTotal(d: MonthlySummaryResponse): number {
    return d.byKind.find((k) => k.kind === 'INCOME')?.total ?? 0;
  }

  expenseTotal(d: MonthlySummaryResponse): number {
    return Math.abs(d.byKind.find((k) => k.kind === 'EXPENSE')?.total ?? 0);
  }

  netTotal(d: MonthlySummaryResponse): number {
    return this.incomeTotal(d) - this.expenseTotal(d);
  }
}

function isYyyyMmDayInMonth(isoDate: string, year: number, month: number): boolean {
  const day = isoDate.slice(0, 10);
  if (day.length < 10) return false;
  const [y, m] = day.split('-').map(Number);
  return y === year && m === month;
}

function openingDeltaInMonth(acc: UiAccount | null, year: number, month: number): number {
  if (!acc?.initialBalanceDate || !isYyyyMmDayInMonth(acc.initialBalanceDate, year, month)) return 0;
  const s = acc.initialBalance != null ? Number(acc.initialBalance) : 0;
  return Number.isFinite(s) ? s : 0;
}

function formatSaldoEmLabel(year: number, month: number, lastDay: number): string {
  const dt = new Date(year, month - 1, lastDay);
  const day = String(dt.getDate()).padStart(2, '0');
  const mon = dt.toLocaleDateString('pt-BR', { month: 'long' });
  return `Saldo em ${day} ${mon}`;
}

function formatAxisDayLabel(year: number, month: number, dom: number): string {
  const dt = new Date(year, month - 1, dom);
  const d = String(dom).padStart(2, '0');
  const m = dt
    .toLocaleDateString('pt-BR', { month: 'short' })
    .replace(/\.$/, '')
    .replace(/^\w/, (c) => c.toLowerCase());
  return `${d} ${m}.`;
}

/**
 * Série ao longo do mês: saldo acumulado dia a dia na conta principal; no último tick inclui o resíduo de metas.
 */
function buildCashflowSeries(
  year: number,
  month: number,
  txs: TransactionResponse[],
  acc: UiAccount | null,
  goalResidue: number,
): { labels: string[]; values: number[]; accountEnd: number } {
  const lastDay = new Date(year, month, 0).getDate();
  const dayDelta = new Map<number, number>();

  const opening = openingDeltaInMonth(acc, year, month);
  if (opening !== 0 && acc?.initialBalanceDate) {
    const dom = Number(acc.initialBalanceDate.slice(8, 10));
    if (dom >= 1 && dom <= lastDay) {
      dayDelta.set(dom, (dayDelta.get(dom) ?? 0) + opening);
    }
  }

  for (const t of txs) {
    const d = new Date(t.occurredAt);
    if (d.getFullYear() !== year || d.getMonth() + 1 !== month) continue;
    const dom = d.getDate();
    const delta = t.kind === 'INCOME' ? Number(t.amount) : -Number(t.amount);
    dayDelta.set(dom, (dayDelta.get(dom) ?? 0) + delta);
  }

  const dailyCum: number[] = [];
  let run = 0;
  for (let dom = 1; dom <= lastDay; dom++) {
    run += dayDelta.get(dom) ?? 0;
    dailyCum.push(run);
  }
  const accountEnd = dailyCum.length ? dailyCum[dailyCum.length - 1] : 0;

  const tickCandidates = [1, 4, 11, 18, 25, lastDay].filter((d) => d >= 1 && d <= lastDay);
  const tickDays = [...new Set(tickCandidates)].sort((a, b) => a - b);

  const labels: string[] = [];
  const values: number[] = [];
  for (const dom of tickDays) {
    labels.push(formatAxisDayLabel(year, month, dom));
    let v = dailyCum[dom - 1];
    if (dom === lastDay) {
      v += goalResidue;
    }
    values.push(v);
  }

  return { labels, values, accountEnd };
}

/** Impacto negativo no caixa quando a despesa real ultrapassa a meta do mês. */
function computeGoalResidue(
  goals: BudgetGoalMonthResponse | null,
  byCategory: { categoryName: string; total: number }[],
): number {
  if (!goals?.rows?.length) return 0;
  const spentByName = new Map<string, number>();
  for (const c of byCategory) {
    spentByName.set(c.categoryName, Math.abs(Number(c.total)));
  }
  let residue = 0;
  for (const r of goals.rows) {
    const goal = Number(r.currentGoal);
    if (!Number.isFinite(goal) || goal <= 0) continue;
    const spent = spentByName.get(r.categoryName) ?? 0;
    const over = spent - goal;
    if (over > 0) residue -= over;
  }
  return residue;
}

function barClassForMetasPct(pct: number): MetasDespesaRow['barClass'] {
  if (pct >= 100) return 'metas-bar--full';
  if (pct > 0) return 'metas-bar--part';
  return 'metas-bar--empty';
}

function buildMetasDespesaRows(
  goals: BudgetGoalMonthResponse | null,
  byCategory: { categoryName: string; total: number }[],
): MetasDespesaRow[] {
  if (!goals?.rows?.length) return [];
  const spentByName = new Map<string, number>();
  for (const c of byCategory) {
    spentByName.set(c.categoryName, Math.abs(Number(c.total)));
  }
  const rows: MetasDespesaRow[] = [];
  for (const r of goals.rows) {
    const meta = Number(r.currentGoal);
    if (!Number.isFinite(meta) || meta <= 0) continue;
    const realizado = spentByName.get(r.categoryName) ?? 0;
    const aRealizar = Math.max(0, meta - realizado);
    const pct = meta > 0 ? (realizado / meta) * 100 : 0;
    const pctBar = Math.min(100, pct);
    rows.push({
      categoryName: r.categoryName,
      meta,
      realizado,
      aRealizar,
      pct,
      pctBar,
      barClass: barClassForMetasPct(pct),
    });
  }
  return rows;
}

function computeMetasTotals(rows: MetasDespesaRow[]): MetasDespesaTotal {
  const meta = rows.reduce((s, r) => s + r.meta, 0);
  const realizado = rows.reduce((s, r) => s + r.realizado, 0);
  const aRealizar = rows.reduce((s, r) => s + r.aRealizar, 0);
  const pct = meta > 0 ? (realizado / meta) * 100 : 0;
  const pctBar = Math.min(100, pct);
  return { meta, realizado, aRealizar, pct, pctBar, barClass: barClassForMetasPct(pct) };
}
