import { Component, Inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';
import {
  centsFromAmountInputEvent,
  formatBrlAmountInput,
} from '../../core/utils/brl-money-input';
import {
  RepetitionCustomizeDialogData,
  RepetitionCustomizeDialogResult,
  type InstallmentPeriodicity,
} from './repetition-customize-dialog.data';

@Component({
  selector: 'app-repetition-customize-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatRadioModule,
    MatCheckboxModule,
  ],
  templateUrl: './repetition-customize-dialog.component.html',
  styleUrl: './repetition-customize-dialog.component.scss',
})
export class RepetitionCustomizeDialogComponent {
  readonly form: FormGroup;

  /** Valor mascarado (total ou por parcela, conforme o checkbox «Valor da parcela»). */
  readonly amountCents = signal(0);
  readonly amountText = signal(formatBrlAmountInput(0));
  /** Total de referência (modo «Valor total») para converter ao marcar «Valor da parcela». */
  private readonly referenceTotalCents = signal(0);

  constructor(
    private readonly fb: FormBuilder,
    private readonly ref: MatDialogRef<RepetitionCustomizeDialogComponent, RepetitionCustomizeDialogResult | undefined>,
    @Inject(MAT_DIALOG_DATA) public readonly data: RepetitionCustomizeDialogData,
  ) {
    this.form = this.fb.nonNullable.group({
      repetition: [data.repetition, Validators.required],
      periodicity: [data.periodicity],
      everyNMonths: [data.everyNMonths, [Validators.min(1), Validators.max(120)]],
      installmentCount: [data.installmentCount, [Validators.min(2), Validators.max(999)]],
      initialInstallment: [data.initialInstallment, [Validators.min(1)]],
      parcelAmount: [data.parcelAmount, [Validators.min(0)]],
      useParcelAmountMode: [data.useParcelAmountMode],
      defineTotalOccurrences: [data.defineTotalOccurrences ?? false],
    });

    const totalCents = Math.round(Math.max(0, data.totalAmount ?? 0) * 100);
    this.referenceTotalCents.set(totalCents);
    let initialCents = totalCents;
    if (data.useParcelAmountMode) {
      initialCents =
        data.parcelAmount > 0
          ? Math.round(data.parcelAmount * 100)
          : totalCents;
    }
    this.setAmountCents(initialCents);

    this.form.controls['repetition'].valueChanges.subscribe((rep) => {
      this.syncRepValidators();
      if (rep === 'PARCELADO' && this.amountCents() === 0 && this.referenceTotalCents() > 0) {
        this.setAmountCents(this.referenceTotalCents());
      }
    });
    this.form.controls['defineTotalOccurrences'].valueChanges.subscribe(() => this.syncRepValidators());
    this.syncRepValidators();
  }

  onParcelAmountModeChange(ev: MatCheckboxChange): void {
    this.convertAmountOnModeChange(ev.checked);
  }

  /** Ao alternar total ↔ parcela: mantém o número ao marcar; ao desmarcar, exibe o total (parcela × n). */
  private convertAmountOnModeChange(useParcel: boolean): void {
    const count = this.installmentCountValue();
    if (count < 1) return;

    if (useParcel) {
      const parcelCents =
        this.amountCents() > 0 ? this.amountCents() : this.referenceTotalCents();
      if (parcelCents <= 0) return;
      this.setAmountCents(parcelCents);
      this.referenceTotalCents.set(parcelCents * count);
      return;
    }

    const parcelCents = this.amountCents();
    if (parcelCents <= 0) return;
    const totalCents = parcelCents * count;
    this.referenceTotalCents.set(totalCents);
    this.setAmountCents(totalCents);
  }

  private setAmountCents(cents: number): void {
    this.amountCents.set(cents);
    this.amountText.set(formatBrlAmountInput(cents / 100));
  }

  onAmountInput(ev: Event): void {
    const cents = centsFromAmountInputEvent(ev, this.amountCents());
    this.setAmountCents(cents);
    if (!this.isParcelValueMode()) {
      this.referenceTotalCents.set(cents);
    }
  }

  onAmountBlur(): void {
    this.amountText.set(formatBrlAmountInput(this.amountCents() / 100));
  }

  isParcelValueMode(): boolean {
    return !!this.form.controls['useParcelAmountMode'].value;
  }

  amountFieldLabel(): string {
    return this.isParcelValueMode() ? 'Valor da parcela (R$)' : 'Valor total (R$)';
  }

  private installmentCountValue(): number {
    return Math.max(0, Math.floor(Number(this.form.controls['installmentCount'].value) || 0));
  }

  parcelValueCents(): number {
    const count = this.installmentCountValue();
    if (count < 1) return 0;
    return this.isParcelValueMode() ? this.amountCents() : Math.floor(this.amountCents() / count);
  }

  totalValueCents(): number {
    const count = this.installmentCountValue();
    return this.isParcelValueMode() ? this.amountCents() * Math.max(1, count) : this.amountCents();
  }

  /** Resumo calculado: parcela unitária (modo total) ou total (modo parcela). */
  installmentSummary(): string {
    const count = this.installmentCountValue();
    if (count < 1 || this.amountCents() === 0) return '';
    if (this.isParcelValueMode()) {
      const parcel = formatBrlAmountInput(this.amountCents() / 100);
      const total = formatBrlAmountInput(this.totalValueCents() / 100);
      return `${count} × R$ ${parcel} · Total R$ ${total}`;
    }
    const parcel = formatBrlAmountInput(this.parcelValueCents() / 100);
    return `${count} parcela${count > 1 ? 's' : ''} de R$ ${parcel}`;
  }

  private syncRepValidators(): void {
    const rep = this.form.controls['repetition'].value;
    const periodicity = this.form.controls['periodicity'];
    const every = this.form.controls['everyNMonths'];
    const count = this.form.controls['installmentCount'];
    const init = this.form.controls['initialInstallment'];
    const parcel = this.form.controls['parcelAmount'];
    if (rep === 'PARCELADO') {
      periodicity.setValidators([Validators.required]);
      every.setValidators([Validators.required, Validators.min(1), Validators.max(120)]);
      count.setValidators([Validators.required, Validators.min(2), Validators.max(999)]);
      init.setValidators([Validators.required, Validators.min(1)]);
      parcel.setValidators([Validators.min(0)]);
    } else if (rep === 'FIXA') {
      periodicity.setValidators([Validators.required]);
      every.setValidators([Validators.required, Validators.min(1), Validators.max(120)]);
      init.clearValidators();
      parcel.clearValidators();
      if (this.form.controls['defineTotalOccurrences'].value) {
        count.setValidators([Validators.required, Validators.min(1), Validators.max(999)]);
      } else {
        count.clearValidators();
      }
    } else {
      [periodicity, every, count, init, parcel].forEach((c) => c.clearValidators());
    }
    if (rep !== 'PARCELADO') {
      this.form.controls['useParcelAmountMode'].setValue(false, { emitEvent: false });
    }
    [periodicity, every, count, init, parcel].forEach((c) => c.updateValueAndValidity({ emitEvent: false }));
  }

  close(): void {
    this.ref.close(undefined);
  }

  apply(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue() as RepetitionCustomizeDialogResult;
    if (v.repetition === 'PARCELADO') {
      const count = this.installmentCountValue();
      if (this.isParcelValueMode()) {
        v.parcelAmount = this.amountCents() / 100;
        v.totalAmount = Math.round(((this.amountCents() * Math.max(1, count)) / 100) * 100) / 100;
      } else {
        v.parcelAmount = 0;
        v.totalAmount = this.amountCents() / 100;
        this.referenceTotalCents.set(this.amountCents());
      }
    } else {
      v.totalAmount = this.data.totalAmount;
    }
    this.ref.close(v);
  }

  isParcelado(): boolean {
    return this.form.controls['repetition'].value === 'PARCELADO';
  }

  isFixa(): boolean {
    return this.form.controls['repetition'].value === 'FIXA';
  }

  fixaDefineTotal(): boolean {
    return !!this.form.controls['defineTotalOccurrences'].value;
  }

  /** Rótulo do intervalo consoante a periodicidade (modal «Fixa»). */
  everyIntervalLabel(): string {
    const p = this.form.controls['periodicity'].value as InstallmentPeriodicity | undefined;
    switch (p) {
      case 'SEMANAL':
        return 'Repete-se a cada n semanas';
      case 'TRIMESTRAL':
        return 'Repete-se a cada n trimestres';
      default:
        return 'Repete-se a cada n meses';
    }
  }
}
