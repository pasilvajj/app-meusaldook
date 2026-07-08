import { ArcElement, Chart, registerables } from 'chart.js';
import {
  Component,
  ElementRef,
  Injector,
  OnDestroy,
  ViewChild,
  afterNextRender,
  computed,
  inject,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SummaryApiService } from '../../core/services/summary-api.service';
import type { MonthlySummaryResponse } from '../../core/models/summary.models';
import {
  INVOICE_PAYMENT_HINT,
  categorizedExpenseTotal as sumCategorizedExpenses,
  expenseKindTotal,
  invoicePaymentExpenseTotal,
} from '../../core/utils/expense-summary.util';

Chart.register(...registerables);

const CHART_PALETTE = ['#0d9488', '#2563eb', '#d97706', '#a855f7', '#db2777', '#0ea5e9', '#64748b'] as const;

@Component({
  selector: 'app-category-totals-report',
  standalone: true,
  imports: [
    DecimalPipe,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './category-totals-report.component.html',
  styleUrl: './category-totals-report.component.scss',
})
export class CategoryTotalsReportComponent implements OnDestroy {
  private readonly summaryApi = inject(SummaryApiService);
  private readonly snack = inject(MatSnackBar);
  private readonly injector = inject(Injector);

  readonly invoicePaymentHint = INVOICE_PAYMENT_HINT;

  @ViewChild('expenseDonut') private expenseDonut?: ElementRef<HTMLCanvasElement>;
  @ViewChild('incomeDonut') private incomeDonut?: ElementRef<HTMLCanvasElement>;

  readonly loading = signal(true);
  readonly summary = signal<MonthlySummaryResponse | null>(null);
  readonly focusDate = signal(startOfMonth(new Date()));

  readonly periodLabel = computed(() => {
    const d = this.focusDate();
    const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  private charts: Chart[] = [];
  private chartsHostAlive = true;

  ngOnDestroy(): void {
    this.chartsHostAlive = false;
    this.destroyCharts();
  }

  constructor() {
    this.load();
  }

  shiftMonth(delta: number): void {
    const d = this.focusDate();
    this.focusDate.set(new Date(d.getFullYear(), d.getMonth() + delta, 1));
    this.load();
  }

  load(): void {
    this.loading.set(true);
    const d = this.focusDate();
    this.summaryApi.monthly(d.getFullYear(), d.getMonth() + 1, 'principal').subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.loading.set(false);
        runInInjectionContext(this.injector, () => {
          afterNextRender(() => {
            if (!this.chartsHostAlive) return;
            this.paintCharts(summary);
          });
        });
      },
      error: () => {
        this.loading.set(false);
        this.summary.set(null);
        this.snack.open('Não foi possível carregar o relatório.', 'Fechar', { duration: 5000 });
      },
    });
  }

  expenseRows(summary: MonthlySummaryResponse) {
    return summary.byCategory.filter((c) => c.total !== 0);
  }

  incomeRows(summary: MonthlySummaryResponse) {
    return (summary.byIncomeCategory ?? []).filter((c) => c.total !== 0);
  }

  incomeTotal(summary: MonthlySummaryResponse): number {
    return summary.byKind.find((k) => k.kind === 'INCOME')?.total ?? 0;
  }

  expenseTotal(summary: MonthlySummaryResponse): number {
    return expenseKindTotal(summary);
  }

  categorizedExpenseTotal(summary: MonthlySummaryResponse): number {
    return sumCategorizedExpenses(summary);
  }

  invoicePaymentTotal(summary: MonthlySummaryResponse): number {
    return invoicePaymentExpenseTotal(summary);
  }

  netTotal(summary: MonthlySummaryResponse): number {
    return this.incomeTotal(summary) - this.expenseTotal(summary);
  }

  categorySharePct(rows: { total: number }[], row: { total: number }): string {
    const sum = rows.reduce((s, c) => s + Math.abs(c.total), 0);
    if (!sum) return '0,00';
    const pct = (Math.abs(row.total) / sum) * 100;
    return pct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  legendColor(index: number): string {
    return CHART_PALETTE[index % CHART_PALETTE.length] ?? '#94a3b8';
  }

  formatBrl(value: number): string {
    const v = Number.isFinite(value) ? Math.abs(value) : 0;
    const s = v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return s.replace(/\./g, '\u202f');
  }

  private destroyCharts(): void {
    this.charts.forEach((c) => c.destroy());
    this.charts = [];
  }

  private paintCharts(summary: MonthlySummaryResponse): void {
    if (!this.chartsHostAlive) return;
    this.destroyCharts();
    this.paintDonut(this.expenseDonut?.nativeElement, this.expenseRows(summary), 'Despesas');
    this.paintDonut(this.incomeDonut?.nativeElement, this.incomeRows(summary), 'Receitas');
  }

  private paintDonut(
    canvas: HTMLCanvasElement | undefined,
    rows: { categoryName: string; total: number }[],
    label: string,
  ): void {
    if (!canvas) return;
    const labels = rows.map((r) => r.categoryName);
    const data = rows.map((r) => Math.abs(r.total));

    this.charts.push(
      new Chart<'doughnut'>(canvas, {
        type: 'doughnut',
        data: {
          labels: labels.length ? labels : ['Sem dados'],
          datasets: [
            {
              label,
              data: data.length ? data : [1],
              backgroundColor: labels.length ? CHART_PALETTE.slice(0, labels.length) : ['#cbd5e1'],
              borderWidth: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '58%',
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const raw = ctx.raw as number;
                  const arr = (ctx.dataset.data as number[]).filter((n) => typeof n === 'number');
                  const sum = arr.reduce((a, b) => a + b, 0);
                  const pct = sum ? (raw / sum) * 100 : 0;
                  const pctStr = pct.toLocaleString('pt-BR', {
                    maximumFractionDigits: 2,
                    minimumFractionDigits: 2,
                  });
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

  private donutSlicePercentPlugin() {
    return {
      id: 'reportDonutSlicePct',
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
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
