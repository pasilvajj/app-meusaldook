import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { startWith } from 'rxjs/operators';
import { AccountApiService } from '../../core/services/account-api.service';
import {
  centsFromAmountInputEvent,
  formatBrlAmountInput,
} from '../../core/utils/brl-money-input';
import { writeDtoForCreate } from './account-api.mapper';
import {
  defaultNextInvoiceIso,
  formatBrDate,
  invoiceClosingIso,
} from './credit-card-invoice.util';
import {
  ACCOUNT_TYPE_OPTIONS,
  CREDIT_CARD_CONSIDER_BALANCE_OPTIONS,
  AccountType,
} from './account.models';

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
  readonly creditCardConsiderOptions = CREDIT_CARD_CONSIDER_BALANCE_OPTIONS;
  readonly showAdvanced = signal(false);
  readonly saving = signal(false);
  readonly limitAmountCents = signal(0);
  readonly limitAmountText = signal(formatBrlAmountInput(0));

  readonly form = this.fb.nonNullable.group({
    accountType: ['CHECKING' as AccountType, Validators.required],
    currency: ['BRL' as const, Validators.required],
    name: ['', [Validators.required, Validators.maxLength(120)]],
    initialBalance: ['' as string | number, []],
    notes: ['', Validators.maxLength(500)],
    considerBalanceMode: ['PENDING' as 'IMMEDIATE' | 'PENDING', Validators.required],
    creditCardDueDay: [10, [Validators.min(1), Validators.max(31)]],
    creditCardNextInvoiceDate: [defaultNextInvoiceIso(10)],
    creditCardClosingDaysBeforeDue: [10, [Validators.min(0), Validators.max(30)]],
  });

  private readonly formTick = toSignal(this.form.valueChanges.pipe(startWith(this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  readonly isCreditCard = computed(() => this.formTick().accountType === 'CREDIT_CARD');

  readonly closingHint = computed(() => {
    this.formTick();
    const next = this.form.controls.creditCardNextInvoiceDate.value;
    const days = Number(this.form.controls.creditCardClosingDaysBeforeDue.value);
    if (!next) return '';
    const closingIso = invoiceClosingIso(next, Number.isFinite(days) ? days : 10);
    return formatBrDate(closingIso);
  });

  constructor() {
    this.form.controls.accountType.valueChanges.subscribe((type) => {
      if (type === 'CREDIT_CARD') {
        this.syncCreditCardDates();
        this.setCreditCardValidators(true);
        this.form.controls.considerBalanceMode.setValue('PENDING');
      } else {
        this.setCreditCardValidators(false);
        this.form.controls.considerBalanceMode.setValue('IMMEDIATE');
      }
    });
  }

  toggleAdvanced(): void {
    this.showAdvanced.update((v) => !v);
  }

  onDueDayInput(): void {
    if (!this.isCreditCard()) return;
    this.syncCreditCardDates();
  }

  onLimitAmountInput(ev: Event): void {
    const cents = centsFromAmountInputEvent(ev, this.limitAmountCents());
    this.limitAmountCents.set(cents);
    this.limitAmountText.set(formatBrlAmountInput(cents / 100));
  }

  onLimitAmountBlur(): void {
    this.limitAmountText.set(formatBrlAmountInput(this.limitAmountCents() / 100));
  }

  save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const n = v.notes.trim();
    const isCard = v.accountType === 'CREDIT_CARD';
    const bal = isCard ? this.limitAmountCents() / 100 : this.parseBalance(v.initialBalance);
    const initialBalanceAmount = bal != null ? Math.abs(bal) : 0;
    const saldoCreditorDebtor = bal != null && bal < 0 ? 'DEBTOR' : 'CREDITOR';
    const dto = writeDtoForCreate({
      accountType: v.accountType as AccountType,
      currency: v.currency,
      name: v.name.trim(),
      initialBalanceDate: new Date().toISOString().slice(0, 10),
      initialBalanceAmount,
      saldoCreditorDebtor: isCard ? 'CREDITOR' : saldoCreditorDebtor,
      considerBalanceMode: isCard ? v.considerBalanceMode : 'IMMEDIATE',
      ...(isCard
        ? {
            creditCardDueDay: Number(v.creditCardDueDay),
            creditCardNextInvoiceDate: v.creditCardNextInvoiceDate,
            creditCardClosingDaysBeforeDue: Number(v.creditCardClosingDaysBeforeDue),
          }
        : {}),
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

  private syncCreditCardDates(): void {
    const dueDay = Number(this.form.controls.creditCardDueDay.value);
    if (!Number.isFinite(dueDay) || dueDay < 1 || dueDay > 31) return;
    this.form.controls.creditCardNextInvoiceDate.setValue(defaultNextInvoiceIso(dueDay));
  }

  private setCreditCardValidators(enabled: boolean): void {
    const due = this.form.controls.creditCardDueDay;
    const next = this.form.controls.creditCardNextInvoiceDate;
    const closing = this.form.controls.creditCardClosingDaysBeforeDue;
    const consider = this.form.controls.considerBalanceMode;
    if (enabled) {
      due.setValidators([Validators.required, Validators.min(1), Validators.max(31)]);
      next.setValidators([Validators.required]);
      closing.setValidators([Validators.required, Validators.min(0), Validators.max(30)]);
      consider.setValidators([Validators.required]);
    } else {
      due.clearValidators();
      next.clearValidators();
      closing.clearValidators();
      consider.clearValidators();
    }
    due.updateValueAndValidity({ emitEvent: false });
    next.updateValueAndValidity({ emitEvent: false });
    closing.updateValueAndValidity({ emitEvent: false });
    consider.updateValueAndValidity({ emitEvent: false });
  }

  private parseBalance(v: string | number): number | null {
    if (v === '' || v === null || v === undefined) return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
}
