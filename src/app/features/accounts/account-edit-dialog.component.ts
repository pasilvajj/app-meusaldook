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
  defaultNextInvoiceIso,
  formatBrDate,
  invoiceClosingIso,
} from './credit-card-invoice.util';
import {
  ACCOUNT_TYPE_OPTIONS,
  CONSIDER_BALANCE_OPTIONS,
  CREDIT_CARD_CONSIDER_BALANCE_OPTIONS,
  PREPAID_KIND_OPTIONS,
  AccountEditDialogData,
  AccountType,
  PrepaidKind,
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
  readonly prepaidKindOptions = PREPAID_KIND_OPTIONS;
  readonly considerOptions = CONSIDER_BALANCE_OPTIONS;
  readonly creditCardConsiderOptions = CREDIT_CARD_CONSIDER_BALANCE_OPTIONS;
  readonly saving = signal(false);

  private readonly initialDueDay = this.data.account.creditCardDueDay ?? 10;
  private readonly initialAmount = Math.abs(this.data.account.initialBalanceAmount ?? 0);
  readonly balanceAmountCents = signal(Math.round(this.initialAmount * 100));
  readonly balanceAmountText = signal(formatBrlAmountInput(this.initialAmount));

  readonly form = this.fb.nonNullable.group({
    accountType: [this.data.account.accountType ?? 'CHECKING', Validators.required],
    prepaidKind: [(this.data.account.prepaidKind ?? 'MEAL_VOUCHER') as PrepaidKind, Validators.required],
    currency: [(this.data.account.currency ?? 'BRL') as 'BRL', Validators.required],
    name: [this.data.account.name, [Validators.required, Validators.maxLength(120)]],
    initialBalanceDate: [this.data.account.initialBalanceDate ?? '', Validators.required],
    initialBalanceAmount: [this.data.account.initialBalanceAmount ?? 0, [Validators.required, Validators.min(0)]],
    saldoCreditorDebtor: [this.data.account.saldoCreditorDebtor ?? 'CREDITOR', Validators.required],
    considerBalanceMode: [this.data.account.considerBalanceMode ?? 'IMMEDIATE', Validators.required],
    creditCardDueDay: [this.initialDueDay, [Validators.min(1), Validators.max(31)]],
    creditCardNextInvoiceDate: [
      this.data.account.creditCardNextInvoiceDate?.slice(0, 10) ?? defaultNextInvoiceIso(this.initialDueDay),
    ],
    creditCardClosingDaysBeforeDue: [this.data.account.creditCardClosingDaysBeforeDue ?? 10, [Validators.min(0), Validators.max(30)]],
  });

  private readonly formTick = toSignal(this.form.valueChanges.pipe(startWith(this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  readonly isCreditCard = computed(() => this.formTick().accountType === 'CREDIT_CARD');
  readonly isPrepaid = computed(() => this.formTick().accountType === 'PREPAID');

  readonly considerOptionsForType = computed(() =>
    this.isCreditCard() ? this.creditCardConsiderOptions : this.considerOptions,
  );

  readonly selectedPrepaidHint = computed(() => {
    if (!this.isPrepaid()) return '';
    const kind = this.formTick().prepaidKind as PrepaidKind;
    return this.prepaidKindOptions.find((o) => o.id === kind)?.hint ?? '';
  });

  readonly considerBalanceLabel = computed(() =>
    this.isCreditCard() ? 'Prever débito na conta' : 'Considerar saldo',
  );

  readonly closingHint = computed(() => {
    if (!this.isCreditCard()) return '';
    this.formTick();
    const next = this.form.controls.creditCardNextInvoiceDate.value;
    const days = Number(this.form.controls.creditCardClosingDaysBeforeDue.value);
    if (!next) return '';
    return formatBrDate(invoiceClosingIso(next, Number.isFinite(days) ? days : 10));
  });

  readonly saldoFieldLabel = computed(() => {
    if (this.isCreditCard()) return 'Limite (R$)';
    this.formTick();
    const raw = this.form.controls.initialBalanceDate.value;
    if (!raw || raw.length < 10) return 'Saldo (R$)';
    const [y, m, d] = raw.split('-');
    return `Saldo em ${d}/${m}/${y} (R$)`;
  });

  constructor() {
    this.applyTypeRules(this.form.controls.accountType.value as AccountType);
    this.form.controls.accountType.valueChanges.subscribe((type) => {
      this.applyTypeRules(type as AccountType);
    });
  }

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

  onDueDayInput(): void {
    if (!this.isCreditCard()) return;
    this.syncCreditCardDates();
  }

  save(): void {
    this.onBalanceAmountBlur();
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const prev = this.data.account;
    const isCard = v.accountType === 'CREDIT_CARD';
    const isPrepaidAcc = v.accountType === 'PREPAID';
    const signed = isCard
      ? Math.abs(v.initialBalanceAmount)
      : v.saldoCreditorDebtor === 'CREDITOR'
        ? Math.abs(v.initialBalanceAmount)
        : -Math.abs(v.initialBalanceAmount);
    const account: UiAccount = {
      ...prev,
      name: v.name.trim(),
      currency: v.currency,
      accountType: v.accountType as AccountType,
      prepaidKind: isPrepaidAcc ? (v.prepaidKind as PrepaidKind) : null,
      initialBalanceDate: v.initialBalanceDate,
      initialBalanceAmount: Math.abs(v.initialBalanceAmount),
      saldoCreditorDebtor: isCard ? 'CREDITOR' : isPrepaidAcc ? 'CREDITOR' : v.saldoCreditorDebtor,
      considerBalanceMode: v.considerBalanceMode,
      initialBalance: signed,
      creditCardDueDay: isCard ? Number(v.creditCardDueDay) : null,
      creditCardNextInvoiceDate: isCard ? v.creditCardNextInvoiceDate : null,
      creditCardClosingDaysBeforeDue: isCard ? Number(v.creditCardClosingDaysBeforeDue) : null,
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
        this.snack.open('Não foi possível salvar as alterações.', 'Fechar', { duration: 5000 });
      },
    });
  }

  infoLink(): void {
    const msg = this.isCreditCard()
      ? 'O limite e o vencimento definem a fatura do cartão. Integração bancária virá mais tarde.'
      : 'O saldo inicial e a data definem o ponto de partida do extrato. Integração bancária virá mais tarde.';
    window.alert(msg);
  }

  private applyTypeRules(type: AccountType): void {
    const isCard = type === 'CREDIT_CARD';
    const isPrepaidAcc = type === 'PREPAID';
    this.setCreditCardValidators(isCard);
    this.setPrepaidValidators(isPrepaidAcc);
    if (isCard) {
      if (!this.form.controls.creditCardNextInvoiceDate.value) {
        this.syncCreditCardDates();
      }
      if (this.form.controls.considerBalanceMode.value === 'IMMEDIATE') {
        this.form.controls.considerBalanceMode.setValue('PENDING');
      }
    } else if (isPrepaidAcc) {
      this.form.controls.considerBalanceMode.setValue('IMMEDIATE');
    }
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
    const balanceDate = this.form.controls.initialBalanceDate;
    const saldoNature = this.form.controls.saldoCreditorDebtor;
    if (enabled) {
      due.setValidators([Validators.required, Validators.min(1), Validators.max(31)]);
      next.setValidators([Validators.required]);
      closing.setValidators([Validators.required, Validators.min(0), Validators.max(30)]);
      balanceDate.clearValidators();
      saldoNature.clearValidators();
    } else {
      due.clearValidators();
      next.clearValidators();
      closing.clearValidators();
      balanceDate.setValidators([Validators.required]);
      saldoNature.setValidators([Validators.required]);
    }
    due.updateValueAndValidity({ emitEvent: false });
    next.updateValueAndValidity({ emitEvent: false });
    closing.updateValueAndValidity({ emitEvent: false });
    balanceDate.updateValueAndValidity({ emitEvent: false });
    saldoNature.updateValueAndValidity({ emitEvent: false });
  }

  private setPrepaidValidators(enabled: boolean): void {
    const kind = this.form.controls.prepaidKind;
    if (enabled) {
      kind.setValidators([Validators.required]);
    } else {
      kind.clearValidators();
    }
    kind.updateValueAndValidity({ emitEvent: false });
  }
}
