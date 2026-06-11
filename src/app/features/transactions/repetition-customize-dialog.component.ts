import { Component, Inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatCheckboxModule } from '@angular/material/checkbox';
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
    this.form.controls['repetition'].valueChanges.subscribe(() => this.syncRepValidators());
    this.form.controls['defineTotalOccurrences'].valueChanges.subscribe(() => this.syncRepValidators());
    this.syncRepValidators();
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
