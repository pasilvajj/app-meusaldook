import { DecimalPipe, NgClass } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { BudgetGoalApiService } from '../../core/services/budget-goal-api.service';
import { SummaryApiService } from '../../core/services/summary-api.service';
import { BudgetGoalMonthResponse, BudgetGoalRow } from '../../core/models/budget-goal.models';
import { MonthlySummaryResponse } from '../../core/models/summary.models';
import { MoneyKind } from '../../core/models/money-kind';
import { DefineGoalsDialogComponent } from './define-goals-dialog.component';

export interface BudgetGoalsTableRow {
  categoryId: number;
  categoryName: string;
  hasMeta: boolean;
  meta: number;
  realizado: number;
  aRealizar: number | null;
  excedente: number | null;
  pct: number;
  pctBar: number;
  barClass: 'goal-bar--full' | 'goal-bar--part' | 'goal-bar--empty';
}

/** Resumo «Categorias definidas» (só linhas com meta > 0). */
export interface GoalsDefinedSummary {
  pct: number;
  pctBar: number;
  barClass: BudgetGoalsTableRow['barClass'];
  totalMeta: number;
  totalRealizado: number;
  totalARealizar: number;
}

/**
 * Resumo «Total do mês»: meta envelope = soma(metas) + gastos/receitas em categorias sem meta
 * (alinhado ao mock em que a meta mensal engloba também o já movimentado fora de metas).
 */
export interface GoalsMonthEnvelopeSummary {
  pct: number;
  pctBar: number;
  barClass: BudgetGoalsTableRow['barClass'];
  metaMes: number;
  totalConfirmado: number;
  aRealizar: number;
}

@Component({
  selector: 'app-budget-goals-page',
  standalone: true,
  imports: [
    MatTabsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    RouterLink,
    DecimalPipe,
    NgClass,
  ],
  templateUrl: './budget-goals-page.component.html',
  styleUrl: './budget-goals-page.component.scss',
})
export class BudgetGoalsPageComponent implements OnInit {
  private readonly api = inject(BudgetGoalApiService);
  private readonly summaryApi = inject(SummaryApiService);
  private readonly dialog = inject(MatDialog);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly year = signal(new Date().getFullYear());
  readonly month = signal(new Date().getMonth() + 1);
  readonly tabIndex = signal(0);
  readonly loading = signal(false);
  readonly snapshot = signal<BudgetGoalMonthResponse | null>(null);
  readonly summary = signal<MonthlySummaryResponse | null>(null);

  readonly tableRows = computed(() => {
    const s = this.snapshot();
    const sum = this.summary();
    if (!s?.rows.length) return [];
    return buildTableRows(s.rows, sum, s.kind);
  });

  /** Linhas da tabela principal: só categorias com meta definida (> 0). */
  readonly tableRowsWithMeta = computed(() => this.tableRows().filter((r) => r.hasMeta));

  readonly definedSummary = computed(() => {
    const rows = this.tableRows();
    return buildDefinedSummary(rows);
  });

  readonly monthEnvelope = computed(() => {
    const rows = this.tableRows();
    return buildMonthEnvelope(rows);
  });

  ngOnInit(): void {
    this.load();
  }

  onTabIndex(index: number): void {
    this.tabIndex.set(index);
    this.load();
  }

  load(): void {
    const tab = this.tabIndex();
    const kind: MoneyKind = tab === 0 ? 'EXPENSE' : 'INCOME';
    this.loading.set(true);
    forkJoin({
      goals: this.api.getMonth(this.year(), this.month(), kind),
      summary: this.summaryApi.monthly(this.year(), this.month(), 'principal').pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ goals, summary }) => {
        this.snapshot.set(goals);
        this.summary.set(summary);
        this.loading.set(false);
        this.maybeOpenDefineFromQuery(goals);
      },
      error: () => {
        this.snapshot.set(null);
        this.summary.set(null);
        this.loading.set(false);
      },
    });
  }

  periodLabel(): string {
    return new Date(this.year(), this.month() - 1, 1).toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    });
  }

  periodLabelShort(): string {
    const d = new Date(this.year(), this.month() - 1, 1);
    const m = d.toLocaleDateString('pt-BR', { month: 'long' });
    return `${this.capitalize(m)} de ${d.getFullYear()}`;
  }

  private capitalize(s: string): string {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  hasCategories(): boolean {
    return (this.snapshot()?.rows.length ?? 0) > 0;
  }

  hasGoals(): boolean {
    const s = this.snapshot();
    if (!s) return false;
    return s.rows.some((r) => r.currentGoal > 0);
  }

  isExpenseTab(): boolean {
    return this.tabIndex() === 0;
  }

  private maybeOpenDefineFromQuery(d: BudgetGoalMonthResponse): void {
    const definir = this.route.snapshot.queryParamMap.get('definir');
    if (definir !== '1') return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { definir: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    if (d.rows.length === 0) return;
    queueMicrotask(() => this.openDefine());
  }

  openDefine(): void {
    const s = this.snapshot();
    if (!s || s.rows.length === 0) return;
    this.dialog
      .open(DefineGoalsDialogComponent, {
        data: s,
        width: '960px',
        maxWidth: '96vw',
        hasBackdrop: true,
        autoFocus: 'dialog',
        panelClass: 'define-goals-dialog-panel',
        backdropClass: ['cdk-overlay-dark-backdrop', 'define-goals-dialog-backdrop'],
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) this.load();
      });
  }

  shiftMonth(delta: number): void {
    const dt = new Date(this.year(), this.month() - 1 + delta, 1);
    this.year.set(dt.getFullYear());
    this.month.set(dt.getMonth() + 1);
    this.load();
  }
}

function spentMapFromSummary(
  sum: MonthlySummaryResponse | null,
  kind: MoneyKind,
): Map<string, number> {
  const m = new Map<string, number>();
  const rows =
    kind === 'EXPENSE' ? sum?.byCategory : sum?.byIncomeCategory ?? [];
  if (!rows?.length) return m;
  for (const c of rows) {
    const raw = Number(c.total);
    const v = Math.abs(raw);
    m.set(c.categoryName, v);
  }
  return m;
}

function barClassForPct(pct: number): BudgetGoalsTableRow['barClass'] {
  if (pct >= 100) return 'goal-bar--full';
  if (pct > 0) return 'goal-bar--part';
  return 'goal-bar--empty';
}

function buildTableRows(
  rows: BudgetGoalRow[],
  sum: MonthlySummaryResponse | null,
  kind: MoneyKind,
): BudgetGoalsTableRow[] {
  const sm = spentMapFromSummary(sum, kind);
  const mapped = rows.map((r) => {
    const meta = Number(r.currentGoal);
    const hasMeta = Number.isFinite(meta) && meta > 0;
    const realizado = sm.get(r.categoryName) ?? 0;
    let aRealizar: number | null = null;
    let excedente: number | null = null;
    let pct = 0;
    let pctBar = 0;
    if (hasMeta) {
      aRealizar = Math.max(0, meta - realizado);
      excedente = Math.max(0, realizado - meta);
      pct = meta > 0 ? (realizado / meta) * 100 : 0;
      pctBar = Math.min(100, pct);
    }
    return {
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      hasMeta,
      meta,
      realizado,
      aRealizar,
      excedente,
      pct,
      pctBar,
      barClass: hasMeta ? barClassForPct(pct) : 'goal-bar--empty',
    };
  });
  const withMeta = mapped.filter((x) => x.hasMeta).sort((a, b) => a.categoryName.localeCompare(b.categoryName, 'pt'));
  const noMeta = mapped.filter((x) => !x.hasMeta).sort((a, b) => a.categoryName.localeCompare(b.categoryName, 'pt'));
  return [...withMeta, ...noMeta];
}

function buildDefinedSummary(rows: BudgetGoalsTableRow[]): GoalsDefinedSummary {
  const def = rows.filter((r) => r.hasMeta);
  if (!def.length) {
    return {
      pct: 0,
      pctBar: 0,
      barClass: 'goal-bar--empty',
      totalMeta: 0,
      totalRealizado: 0,
      totalARealizar: 0,
    };
  }
  const totalMeta = def.reduce((s, r) => s + r.meta, 0);
  const totalRealizado = def.reduce((s, r) => s + r.realizado, 0);
  const totalARealizar = def.reduce((s, r) => s + (r.aRealizar ?? 0), 0);
  const pct = totalMeta > 0 ? (totalRealizado / totalMeta) * 100 : 0;
  const pctBar = Math.min(100, pct);
  return {
    pct,
    pctBar,
    barClass: barClassForPct(pct),
    totalMeta,
    totalRealizado,
    totalARealizar,
  };
}

function buildMonthEnvelope(rows: BudgetGoalsTableRow[]): GoalsMonthEnvelopeSummary | null {
  if (!rows.length) return null;
  const sumMetas = rows.filter((r) => r.hasMeta).reduce((s, r) => s + r.meta, 0);
  const spendNoGoal = rows.filter((r) => !r.hasMeta).reduce((s, r) => s + r.realizado, 0);
  const metaMes = sumMetas + spendNoGoal;
  const totalConfirmado = rows.reduce((s, r) => s + r.realizado, 0);
  const aRealizar = Math.max(0, metaMes - totalConfirmado);
  const pct = metaMes > 0 ? (totalConfirmado / metaMes) * 100 : 0;
  const pctBar = Math.min(100, pct);
  return {
    pct,
    pctBar,
    barClass: barClassForPct(pct),
    metaMes,
    totalConfirmado,
    aRealizar,
  };
}
