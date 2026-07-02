import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { forkJoin, Observable, switchMap } from 'rxjs';
import { AccountApiService } from '../../core/services/account-api.service';
import { CategoryApiService } from '../../core/services/category-api.service';
import { TransactionApiService } from '../../core/services/transaction-api.service';
import {
  centsFromAmountInputEvent,
  formatBrlAmountInput,
} from '../../core/utils/brl-money-input';
import { formatBrDate, invoicePaymentDescription } from './credit-card-invoice.util';
import {
  PostInvoicePaymentDialogData,
  PostInvoicePaymentDialogResult,
} from './post-invoice-payment-dialog.models';
import { TransactionFormDialogService } from '../transactions/transaction-form-dialog.service';
import { accountTypeLabel } from './account.models';

@Component({
  selector: 'app-post-invoice-payment-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    DecimalPipe,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatSnackBarModule,
    MatDatepickerModule,
    MatNativeDateModule,
  ],
  templateUrl: './post-invoice-payment-dialog.component.html',
  styleUrl: './close-invoice-dialog.component.scss',
})
export class PostInvoicePaymentDialogComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef =
    inject(MatDialogRef<PostInvoicePaymentDialogComponent, PostInvoicePaymentDialogResult>);
  readonly data = inject<PostInvoicePaymentDialogData>(MAT_DIALOG_DATA);
  private readonly accountApi = inject(AccountApiService);
  private readonly txApi = inject(TransactionApiService);
  private readonly categoriesApi = inject(CategoryApiService);
  private readonly snack = inject(MatSnackBar);
  private readonly txDialog = inject(TransactionFormDialogService);

  readonly saving = signal(false);
  readonly debitAccounts = signal<{ publicKey: string; name: string; typeLabel: string }[]>([]);
  private paymentCategoryId = signal<number | null>(null);

  readonly remainingAmount = Math.max(0, Math.abs(this.data.summary.amountToPay));
  readonly invoiceDueLabel = formatBrDate(this.data.summary.cycle.dueIso);
  readonly hasScheduledPayment = !!this.data.scheduledPayment;

  private readonly defaultPaymentCents = Math.round(
    (this.data.scheduledPayment
      ? Math.abs(Number(this.data.scheduledPayment.amount))
      : this.remainingAmount) * 100,
  );
  readonly paymentAmountCents = signal(this.defaultPaymentCents);
  readonly paymentAmountText = signal(formatBrlAmountInput(this.defaultPaymentCents / 100));

  readonly form = this.fb.nonNullable.group({
    paymentDate: [
      this.data.scheduledPayment
        ? this.parseIsoDate(this.data.scheduledPayment.occurredAt)
        : new Date(),
      Validators.required,
    ],
    debitAccountKey: [
      this.data.scheduledPayment?.accountPublicKey ?? 'principal',
      Validators.required,
    ],
  });

  readonly displayRemaining = computed(() => {
    const v = this.data.summary.amountToPay;
    return v < 0 ? v : -Math.abs(v);
  });

  ngOnInit(): void {
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

    if (this.paymentAmountCents() < 1) {
      this.snack.open('Informe um valor de pagamento válido.', 'OK', { duration: 4000 });
      return;
    }
    if (!this.form.controls.paymentDate.value) {
      this.form.controls.paymentDate.markAsTouched();
      return;
    }
    if (!this.paymentCategoryId()) {
      this.snack.open('Cadastre ao menos uma categoria de despesa para lançar o pagamento.', 'OK', {
        duration: 5000,
      });
      return;
    }

    this.saving.set(true);
    const scheduled = this.data.scheduledPayment;
    const amount = this.paymentAmountCents() / 100;
    const paymentDate = this.form.controls.paymentDate.value!;
    const occurredAt = this.toIsoFromDate(paymentDate);
    const debitKey = this.form.controls.debitAccountKey.value;

    let payment$: Observable<unknown>;

    if (scheduled) {
      const scheduledCents = Math.round(Math.abs(Number(scheduled.amount)) * 100);
      const needsPatch =
        this.paymentAmountCents() !== scheduledCents ||
        scheduled.accountPublicKey !== debitKey ||
        scheduled.occurredAt.slice(0, 10) !== occurredAt.slice(0, 10);

      if (needsPatch) {
        payment$ = this.txApi
          .update(scheduled.id, {
            amount,
            kind: 'EXPENSE',
            categoryId: scheduled.categoryId,
            accountPublicKey: debitKey,
            description: scheduled.description ?? invoicePaymentDescription(this.data.account.name),
            occurredAt,
          })
          .pipe(switchMap(() => this.txApi.markPaid(scheduled.id)));
      } else {
        payment$ = this.txApi.markPaid(scheduled.id);
      }
    } else {
      payment$ = this.txApi.create({
        amount,
        kind: 'EXPENSE',
        categoryId: this.paymentCategoryId()!,
        accountPublicKey: debitKey,
        description: invoicePaymentDescription(this.data.account.name),
        occurredAt,
        showInPayables: false,
        markAsPaid: true,
      });
    }

    payment$.subscribe({
      next: () => {
        this.txDialog.notifyTransactionCommitted();
        this.snack.open('Pagamento lançado com sucesso.', 'OK', { duration: 4000 });
        this.dialogRef.close({ paid: true });
      },
      error: () => {
        this.saving.set(false);
        this.snack.open('Não foi possível lançar o pagamento.', 'Fechar', { duration: 5000 });
      },
    });
  }

  private parseIsoDate(iso: string): Date {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }

  private toIsoFromDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return new Date(`${y}-${m}-${d}T12:00:00`).toISOString();
  }
}
