import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { startWith } from 'rxjs/operators';
import { AccountApiService } from '../../core/services/account-api.service';
import {
  centsFromAmountInputEvent,
  formatBrlAmountInput,
} from '../../core/utils/brl-money-input';
import { writeDtoFromUi } from './account-api.mapper';
import {
  ACCOUNT_TYPE_OPTIONS,
  CONSIDER_BALANCE_OPTIONS,
  AccountEditDialogData,
  AccountType,
  UiAccount,
} from './account.models';

@Component({
  selector: 'app-account-edit-dialog',
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
    MatRadioModule,
    MatSnackBarModule,
  ],
  templateUrl: './account-edit-dialog.component.html',
  styleUrls: ['./account-form-dialog.component.scss', './account-edit-dialog.component.scss'],
})
export class AccountEditDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<AccountEditDialogComponent, boolean | undefined>);
  private readonly data = inject<AccountEditDialogData>(MAT_DIALOG_DATA);
  private readonly accountApi = inject(AccountApiService);
  private readonly snack = inject(MatSnackBar);

  readonly typeOptions = ACCOUNT_TYPE_OPTIONS;
  readonly considerOptions = CONSIDER_BALANCE_OPTIONS;
  readonly saving = signal(false);

  private readonly initialAmount = Math.abs(this.data.account.initialBalanceAmount ?? 0);
  readonly balanceAmountCents = signal(Math.round(this.initialAmount * 100));
  readonly balanceAmountText = signal(formatBrlAmountInput(this.initialAmount));

  readonly form = this.fb.nonNullable.group({
    accountType: [this.data.account.accountType ?? 'CHECKING', Validators.required],
    currency: [(this.data.account.currency ?? 'BRL') as 'BRL', Validators.required],
    name: [this.data.account.name, [Validators.required, Validators.maxLength(120)]],
    initialBalanceDate: [this.data.account.initialBalanceDate ?? '', Validators.required],
    initialBalanceAmount: [this.data.account.initialBalanceAmount ?? 0, [Validators.required, Validators.min(0)]],
    saldoCreditorDebtor: [this.data.account.saldoCreditorDebtor ?? 'CREDITOR', Validators.required],
    considerBalanceMode: [this.data.account.considerBalanceMode ?? 'IMMEDIATE', Validators.required],
  });

  private readonly formTick = toSignal(this.form.valueChanges.pipe(startWith(this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  readonly saldoFieldLabel = computed(() => {
    this.formTick();
    const raw = this.form.controls.initialBalanceDate.value;
    if (!raw || raw.length < 10) return 'Saldo (R$)';
    const [y, m, d] = raw.split('-');
    return `Saldo em ${d}/${m}/${y} (R$)`;
  });

  onBalanceAmountInput(ev: Event): void {
    const cents = centsFromAmountInputEvent(ev, this.balanceAmountCents());
    this.balanceAmountCents.set(cents);
    const amount = cents / 100;
    this.balanceAmountText.set(formatBrlAmountInput(amount));
    this.form.controls.initialBalanceAmount.setValue(amount);
  }

  onBalanceAmountBlur(): void {
    const amount = this.balanceAmountCents() / 100;
    this.form.controls.initialBalanceAmount.setValue(amount);
    this.balanceAmountText.set(formatBrlAmountInput(amount));
    this.form.controls.initialBalanceAmount.markAsTouched();
  }

  save(): void {
    this.onBalanceAmountBlur();
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const prev = this.data.account;
    const signed =
      v.saldoCreditorDebtor === 'CREDITOR' ? Math.abs(v.initialBalanceAmount) : -Math.abs(v.initialBalanceAmount);
    const account: UiAccount = {
      ...prev,
      name: v.name.trim(),
      currency: v.currency,
      accountType: v.accountType as AccountType,
      initialBalanceDate: v.initialBalanceDate,
      initialBalanceAmount: Math.abs(v.initialBalanceAmount),
      saldoCreditorDebtor: v.saldoCreditorDebtor,
      considerBalanceMode: v.considerBalanceMode,
      initialBalance: signed,
    };
    const dto = writeDtoFromUi(account);
    this.saving.set(true);
    this.accountApi.update(prev.serverId, dto).subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogRef.close(true);
      },
      error: () => {
        this.saving.set(false);
        this.snack.open('Não foi possível guardar as alterações.', 'Fechar', { duration: 5000 });
      },
    });
  }

  infoLink(): void {
    window.alert(
      'O saldo inicial e a data definem o ponto de partida do extrato. Integração bancária virá mais tarde.',
    );
  }
}
