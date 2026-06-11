import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AccountApiService } from '../../core/services/account-api.service';
import { writeDtoForCreate } from './account-api.mapper';
import { ACCOUNT_TYPE_OPTIONS, AccountType } from './account.models';

@Component({
  selector: 'app-account-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatSnackBarModule,
  ],
  templateUrl: './account-form-dialog.component.html',
  styleUrl: './account-form-dialog.component.scss',
})
export class AccountFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<AccountFormDialogComponent, boolean | undefined>);
  private readonly accountApi = inject(AccountApiService);
  private readonly snack = inject(MatSnackBar);

  readonly typeOptions = ACCOUNT_TYPE_OPTIONS;
  readonly showAdvanced = signal(false);
  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group({
    accountType: ['CHECKING' as AccountType, Validators.required],
    currency: ['BRL' as const, Validators.required],
    name: ['', [Validators.required, Validators.maxLength(120)]],
    initialBalance: ['' as string | number, []],
    notes: ['', Validators.maxLength(500)],
  });

  toggleAdvanced(): void {
    this.showAdvanced.update((v) => !v);
  }

  save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const { accountType, currency, name, notes } = this.form.getRawValue();
    const bal = this.parseBalance(this.form.controls.initialBalance.value);
    const n = notes.trim();
    const initialBalanceAmount = bal != null ? Math.abs(bal) : 0;
    const saldoCreditorDebtor = bal != null && bal < 0 ? 'DEBTOR' : 'CREDITOR';
    const dto = writeDtoForCreate({
      accountType: accountType as AccountType,
      currency,
      name: name.trim(),
      initialBalanceDate: new Date().toISOString().slice(0, 10),
      initialBalanceAmount,
      saldoCreditorDebtor,
      considerBalanceMode: 'IMMEDIATE',
      ...(n ? { notes: n } : {}),
    });
    this.saving.set(true);
    this.accountApi.create(dto).subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogRef.close(true);
      },
      error: () => {
        this.saving.set(false);
        this.snack.open('Não foi possível criar a conta.', 'Fechar', { duration: 5000 });
      },
    });
  }

  private parseBalance(v: string | number): number | null {
    if (v === '' || v === null || v === undefined) return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
}
