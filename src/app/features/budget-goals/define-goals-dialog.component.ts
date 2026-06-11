import { DecimalPipe } from '@angular/common';
import { Component, Inject, OnInit, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { BudgetGoalApiService } from '../../core/services/budget-goal-api.service';
import { BudgetGoalMonthResponse } from '../../core/models/budget-goal.models';
import { MoneyKind } from '../../core/models/money-kind';
import { BrlCurrencyInputDirective } from '../../shared/brl-currency-input.directive';

@Component({
  selector: 'app-define-goals-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatSnackBarModule,
    MatIconModule,
    DecimalPipe,
    BrlCurrencyInputDirective,
  ],
  templateUrl: './define-goals-dialog.component.html',
  styleUrl: './define-goals-dialog.component.scss',
})
export class DefineGoalsDialogComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(BudgetGoalApiService);
  private readonly ref = inject(MatDialogRef<DefineGoalsDialogComponent>);
  private readonly snack = inject(MatSnackBar);

  constructor(@Inject(MAT_DIALOG_DATA) public readonly data: BudgetGoalMonthResponse) {}

  readonly showTotalEditor = signal(false);
  readonly saving = signal(false);
  readonly totalDraft = this.fb.control<number | null>(null, [Validators.min(0)]);

  form!: FormGroup;

  get monthTitle(): string {
    return this.capitalize(
      new Date(this.data.year, this.data.month - 1, 1).toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric',
      }),
    );
  }

  /** Ex.: Meta mai/26 (R$) */
  colCurrentLabel(): string {
    return `Meta ${this.monthAbbr(this.data.month)}/${this.twoDigitYear(this.data.year)} (R$)`;
  }

  /** Ex.: Meta abr/26 (R$) */
  colPrevMonthLabel(): string {
    const d = new Date(this.data.year, this.data.month - 2, 1);
    return `Meta ${this.monthAbbr(d.getMonth() + 1)}/${this.twoDigitYear(d.getFullYear())} (R$)`;
  }

  /** Ex.: Meta mai/25 (R$) */
  colPrevYearLabel(): string {
    return `Meta ${this.monthAbbr(this.data.month)}/${this.twoDigitYear(this.data.year - 1)} (R$)`;
  }

  ngOnInit(): void {
    const rows = this.fb.array<FormGroup>([]);
    for (const r of this.data.rows) {
      rows.push(
        this.fb.group({
          categoryId: [r.categoryId],
          categoryName: [r.categoryName],
          amount: [r.currentGoal ?? 0, [Validators.min(0)]],
          prevMonth: [{ value: r.previousMonthGoal, disabled: true }],
          prevYear: [{ value: r.previousYearSameMonthGoal, disabled: true }],
        }),
      );
    }
    this.form = this.fb.group({ rows });
  }

  get rows(): FormArray<FormGroup> {
    return this.form.get('rows') as FormArray<FormGroup>;
  }

  rowsTotal(): number {
    return this.rows.controls.reduce((sum, g) => sum + (Number(g.get('amount')?.value) || 0), 0);
  }

  toggleTotalEditor(): void {
    this.showTotalEditor.update((v) => !v);
    if (this.showTotalEditor()) {
      this.totalDraft.setValue(this.rowsTotal());
    }
  }

  distributeTotal(): void {
    const total = Math.max(0, Number(this.totalDraft.value) || 0);
    const n = this.rows.length;
    if (n === 0) return;
    const base = Math.floor((total / n) * 100) / 100;
    let assigned = 0;
    for (let i = 0; i < n - 1; i++) {
      this.rows.at(i).get('amount')?.setValue(base);
      assigned += base;
    }
    const last = Math.round((total - assigned) * 100) / 100;
    this.rows.at(n - 1).get('amount')?.setValue(last);
    this.showTotalEditor.set(false);
  }

  save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const kind = this.data.kind as MoneyKind;
    const lines = this.rows.controls.map((g) => ({
      categoryId: g.get('categoryId')?.value as number,
      amount: Number(g.get('amount')?.value) || 0,
    }));
    this.api
      .saveBulk({
        year: this.data.year,
        month: this.data.month,
        kind,
        lines,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.ref.close(true);
        },
        error: () => {
          this.saving.set(false);
          this.snack.open('Não foi possível guardar as metas.', 'OK', { duration: 4000 });
        },
      });
  }

  private monthAbbr(month1to12: number): string {
    return new Date(2020, month1to12 - 1, 1)
      .toLocaleDateString('pt-BR', { month: 'short' })
      .replace(/\./g, '')
      .slice(0, 3);
  }

  private twoDigitYear(fullYear: number): string {
    return String(fullYear % 100).padStart(2, '0');
  }

  private capitalize(s: string): string {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}
