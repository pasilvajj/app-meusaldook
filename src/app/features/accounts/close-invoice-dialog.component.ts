import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { forkJoin, Observable, of } from 'rxjs';
import { startWith } from 'rxjs/operators';
import { AccountApiService } from '../../core/services/account-api.service';
import { CategoryApiService } from '../../core/services/category-api.service';
import { TransactionApiService } from '../../core/services/transaction-api.service';
import {
  centsFromAmountInputEvent,
  formatBrlAmountInput,
} from '../../core/utils/brl-money-input';
import { writeDtoFromUi } from './account-api.mapper';
import { formatBrDate, nextInvoiceAfterDue } from './credit-card-invoice.util';
import { CloseInvoiceDialogData, CloseInvoiceDialogResult } from './close-invoice-dialog.models';
import { accountTypeLabel } from './account.models';

@Component({
  selector: 'app-close-invoice-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    DecimalPipe,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatIconModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatDatepickerModule,
    MatNativeDateModule,
  ],
  templateUrl: './close-invoice-dialog.component.html',
  styleUrl: './close-invoice-dialog.component.scss',
})
export class CloseInvoiceDialogComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<CloseInvoiceDialogComponent, CloseInvoiceDialogResult>);
  readonly data = inject<CloseInvoiceDialogData>(MAT_DIALOG_DATA);
  private readonly accountApi = inject(AccountApiService);
  private readonly txApi = inject(TransactionApiService);
  private readonly categoriesApi = inject(CategoryApiService);
  private readonly snack = inject(MatSnackBar);

  readonly saving = signal(false);
  readonly debitAccounts = signal<{ publicKey: string; name: string; typeLabel: string }[]>([]);
  private paymentCategoryId = signal<number | null>(null);

  readonly invoiceAmount = Math.abs(this.data.summary.amountToPay);
  readonly invoiceDueLabel = formatBrDate(this.data.summary.cycle.dueIso);

  private readonly defaultPaymentCents = Math.round(this.invoiceAmount * 100);
  readonly paymentAmountCents = signal(this.defaultPaymentCents);
  readonly paymentAmountText = signal(formatBrlAmountInput(this.invoiceAmount));

  readonly form = this.fb.nonNullable.group({
    schedulePayment: [true],
    paymentDate: [this.parseIsoDate(this.data.summary.cycle.dueIso), Validators.required],
    debitAccountKey: ['principal', Validators.required],
  });

  private readonly formTick = toSignal(this.form.valueChanges.pipe(startWith(this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  readonly schedulePaymentOn = computed(() => Boolean(this.formTick().schedulePayment));

  readonly displayAmount = computed(() => {
    const v = this.data.summary.amountToPay;
    return v < 0 ? v : -Math.abs(v);
  });

  ngOnInit(): void {
    this.applySchedulePaymentState(this.form.controls.schedulePayment.value);
    this.form.controls.schedulePayment.valueChanges.subscribe((on) => this.applySchedulePaymentState(on));

    forkJoin({
      accounts: this.accountApi.list(),
      categories: this.categoriesApi.list(),
    }).subscribe({
      next: ({ accounts, categories }) => {
        const checking = accounts
          .filter((a) => a.active && (a.accountType === 'CHECKING' || a.publicKey === 'principal'))
          .map((a) => ({
            publicKey: a.publicKey,
            name: a.name,
            typeLabel: accountTypeLabel(a.accountType),
          }));
        this.debitAccounts.set(
          checking.length
            ? checking
            : [{ publicKey: 'principal', name: 'Conta principal', typeLabel: accountTypeLabel('CHECKING') }],
        );

        const cur = this.form.controls.debitAccountKey.value;
        const keys = this.debitAccounts().map((a) => a.publicKey);
        if (!keys.includes(cur)) {
          this.form.patchValue({ debitAccountKey: keys[0] ?? 'principal' });
        }

        const expenseCats = categories.filter((c) => c.kind === 'EXPENSE');
        const preferred =
          expenseCats.find((c) => /outras despesas/i.test(c.name)) ??
          expenseCats.find((c) => /fatura|pagamento/i.test(c.name) && !/cart[aã]o/i.test(c.name)) ??
          expenseCats[0];
        this.paymentCategoryId.set(preferred?.id ?? null);
      },
    });
  }

  debitAccountName(publicKey: string | null | undefined): string {
    const key = publicKey ?? 'principal';
    return this.debitAccounts().find((a) => a.publicKey === key)?.name ?? '';
  }

  onPaymentAmountInput(ev: Event): void {
    const cents = centsFromAmountInputEvent(ev, this.paymentAmountCents());
    this.paymentAmountCents.set(cents);
    this.paymentAmountText.set(formatBrlAmountInput(cents / 100));
  }

  onPaymentAmountBlur(): void {
    this.paymentAmountText.set(formatBrlAmountInput(this.paymentAmountCents() / 100));
  }

  submit(): void {
    if (this.saving()) return;

    const schedule = this.form.controls.schedulePayment.value;
    if (schedule && this.paymentAmountCents() < 1) {
      this.snack.open('Informe um valor de pagamento válido.', 'OK', { duration: 4000 });
      return;
    }
    if (schedule && !this.form.controls.paymentDate.value) {
      this.form.controls.paymentDate.markAsTouched();
      return;
    }
    if (schedule && !this.paymentCategoryId()) {
      this.snack.open('Cadastre ao menos uma categoria de despesa para agendar o pagamento.', 'OK', {
        duration: 5000,
      });
      return;
    }

    this.saving.set(true);
    const acc = this.data.account;
    const dueDay = acc.creditCardDueDay ?? 10;
    const nextInvoice = nextInvoiceAfterDue(this.data.summary.cycle.dueIso, dueDay);
    const updatedAccount = { ...acc, creditCardNextInvoiceDate: nextInvoice };

    const accountUpdate$ = this.accountApi.update(acc.serverId, writeDtoFromUi(updatedAccount));

    let payment$: Observable<unknown> = of(null);
    if (schedule && this.paymentAmountCents() >= 1) {
      const paymentDate = this.form.controls.paymentDate.value!;
      const y = paymentDate.getFullYear();
      const m = String(paymentDate.getMonth() + 1).padStart(2, '0');
      const d = String(paymentDate.getDate()).padStart(2, '0');
      const occurredAt = new Date(`${y}-${m}-${d}T12:00:00`).toISOString();

      payment$ = this.txApi.create({
        amount: this.paymentAmountCents() / 100,
        kind: 'EXPENSE',
        categoryId: this.paymentCategoryId()!,
        accountPublicKey: this.form.controls.debitAccountKey.value,
        description: `Pagamento fatura ${acc.name}`,
        occurredAt,
        showInPayables: true,
      });
    }

    forkJoin({ account: accountUpdate$, payment: payment$ }).subscribe({
      next: () => {
        this.snack.open('Fatura fechada com sucesso.', 'OK', { duration: 4000 });
        this.dialogRef.close({ closed: true });
      },
      error: () => {
        this.saving.set(false);
        this.snack.open('Não foi possível fechar a fatura.', 'Fechar', { duration: 5000 });
      },
    });
  }

  private applySchedulePaymentState(on: boolean | null | undefined): void {
    const dateCtrl = this.form.controls.paymentDate;
    const debitCtrl = this.form.controls.debitAccountKey;
    if (on) {
      dateCtrl.enable({ emitEvent: false });
      debitCtrl.enable({ emitEvent: false });
    } else {
      dateCtrl.disable({ emitEvent: false });
      debitCtrl.disable({ emitEvent: false });
    }
  }

  private parseIsoDate(iso: string): Date {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }
}
