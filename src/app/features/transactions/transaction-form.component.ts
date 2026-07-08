import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin, merge, of, startWith, map, switchMap, type Observable } from 'rxjs';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MAT_DATE_LOCALE } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { TransactionApiService } from '../../core/services/transaction-api.service';
import { apiErrorMessage } from '../../core/utils/api-error.util';
import { placeAmountInputCursorAtEnd } from '../../core/utils/brl-money-input';
import {
  RecurringTransactionApiService,
  type RecurringTransactionResponse,
} from '../../core/services/recurring-transaction-api.service';
import { parseFixaMeta } from './fixed-expense-utils';
import { AccountApiService } from '../../core/services/account-api.service';
import { CategoryApiService } from '../../core/services/category-api.service';
import { uiAccountFromApi } from '../accounts/account-api.mapper';
import {
  clampDateToOpenCreditCardCharge,
  minChargeDateForCreditCard,
} from '../accounts/credit-card-invoice.util';
import { MoneyKind } from '../../core/models/money-kind';
import { CategoryResponse } from '../../core/models/category.models';
import type { AccountApiResponse } from '../../core/models/account-api.types';
import { accountTypeLabel } from '../accounts/account.models';
import { TransactionFormDialogData } from './transaction-form-dialog.data';
import { RepetitionCustomizeDialogComponent } from './repetition-customize-dialog.component';
import type {
  InstallmentPeriodicity,
  RepetitionCustomizeDialogData,
  RepetitionCustomizeDialogResult,
} from './repetition-customize-dialog.data';
import { buildInstallmentTransactions } from './installment-planner';
import type { TransactionRequest } from '../../core/models/transaction.models';

@Component({
  selector: 'app-transaction-form',
  standalone: true,
  providers: [{ provide: MAT_DATE_LOCALE, useValue: 'pt-BR' }],
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatDatepickerModule,
    MatCheckboxModule,
    RouterLink,
  ],
  templateUrl: './transaction-form.component.html',
  styleUrl: './transaction-form.component.scss',
})
export class TransactionFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly transactions = inject(TransactionApiService);
  private readonly recurringTransactions = inject(RecurringTransactionApiService);
  private readonly categoriesApi = inject(CategoryApiService);
  private readonly accountsApi = inject(AccountApiService);
  private readonly dialogRef = inject(MatDialogRef<TransactionFormComponent>, { optional: true });
  private readonly overlayDialog = inject(MatDialog);

  private readonly dialogData = inject(MAT_DIALOG_DATA, { optional: true }) as TransactionFormDialogData | undefined;

  /** Quando aberto via {@link MatDialog} (ex.: rota `/transactions/new`). */
  readonly inDialog = !!this.dialogRef;

  /** Layout “Nova despesa” (mock) — só create no modal com `?expense=1`. */
  expenseLayout = false;

  readonly allCategories = signal<CategoryResponse[]>([]);
  private readonly allAccounts = signal<AccountApiResponse[]>([]);
  /** Contas para o select “Conta” no layout despesa (chave = `publicKey`). */
  readonly expenseAccountOptions = signal<
    { publicKey: string; name: string; typeLabel: string; accountType: AccountApiResponse['accountType'] }[]
  >([]);
  private readonly accountsByKey = signal<Map<string, AccountApiResponse>>(new Map());

  expenseAccountName(publicKey: string | null | undefined): string {
    const key = publicKey ?? 'principal';
    return this.expenseAccountOptions().find((a) => a.publicKey === key)?.name ?? '';
  }
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly title = signal('Nova transação');
  /** Título do menu (Nova despesa / Nova receita) no mock. */
  readonly dialogTitle = signal('Nova despesa');
  /** Texto do campo valor (layout despesa) — máscara pt-BR, sincronizado com `amount`. */
  readonly expenseAmountText = signal('');
  /** Pagamento confirmado (default: sim em nova despesa). */
  readonly expensePaymentConfirmed = signal(true);
  readonly occurredDateIsFuture = signal(false);
  /** Valor em centavos (inteiro) — entrada tipo POS; evita texto cru tipo «150000» sem máscara após apagar/redigitar. */
  readonly expenseAmountCents = signal(0);
  /** Data mínima para compras no cartão (após fechamento da fatura anterior). */
  readonly creditCardMinChargeDate = signal<Date | null>(null);

  readonly form = this.fb.nonNullable.group({
    amount: [0, [Validators.min(0.01)]],
    kind: ['EXPENSE' as MoneyKind, Validators.required],
    categoryId: [0, [Validators.required, Validators.min(1)]],
    description: [''],
    occurredAt: ['', Validators.required],
    /** Só layout despesa: data do lançamento (datepicker + digitação). */
    occurredDate: [null as Date | null],
    summary: [''],
    notes: ['', [Validators.maxLength(400)]],
    showInPayables: [true],
    accountKey: ['principal'],
    repetition: ['UNICA' as 'UNICA' | 'PARCELADO' | 'FIXA'],
    /** Parcelado — resumo (sincronizado com o modal «Definir repetição»). */
    installmentPeriodicity: ['MENSAL' as InstallmentPeriodicity],
    parcelEveryMonths: [1, [Validators.min(1), Validators.max(120)]],
    installmentCount: [2, [Validators.min(2), Validators.max(999)]],
    initialInstallment: [1, [Validators.min(1)]],
    parcelAmount: [0, [Validators.min(0)]],
    useParcelAmountMode: [false],
    /** Só «Fixa»: checkbox espelhado no modal «Definir repetição». */
    defineTotalOccurrences: [false],
  });

  readonly notesChars = signal(0);

  readonly filteredCategories = computed(() => {
    const kind = this.form.controls.kind.value;
    return this.allCategories().filter((c) => c.kind === kind);
  });

  readonly showPayablesOption = computed(() => {
    if (!this.expenseLayout) return false;
    if (this.isCreditCardExpenseAccount()) return false;
    if (this.editingRecurringId != null) return true;
    if (this.editingId != null) return !this.expensePaymentConfirmed();
    return this.occurredDateIsFuture() || !this.expensePaymentConfirmed();
  });

  readonly showPaymentConfirmToggle = computed(() => {
    if (!this.expenseLayout || this.isEditingRecurring()) return false;
    return !this.isCreditCardExpenseAccount();
  });

  private editingId: number | null = null;
  private editingRecurringId: number | null = null;

  ngOnInit(): void {
    this.expenseLayout = this.inDialog && this.dialogData?.useExpenseLayout === true;

    this.form.controls.notes.valueChanges.subscribe((v) => {
      this.notesChars.set((v ?? '').length);
    });
    this.notesChars.set((this.form.controls.notes.value ?? '').length);

    forkJoin({
      categories: this.categoriesApi.list(),
      accounts: this.accountsApi.list(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ categories: cats, accounts: accs }) => {
          this.allCategories.set(cats);
          this.applyAccountOptions(accs);
          this.initFormAfterLookups(cats);
        },
        error: () => {
          this.error.set('Não foi possível carregar categorias ou contas.');
          this.loading.set(false);
        },
      });
  }

  private applyAccountOptions(accs: AccountApiResponse[], ensurePublicKeys: string[] = []): void {
    this.allAccounts.set(accs);
    const ensure = new Set(ensurePublicKeys.map((k) => k.trim()).filter(Boolean));
    const selectable = accs.filter((a) => a.active || ensure.has(a.publicKey));
    this.accountsByKey.set(new Map(accs.map((a) => [a.publicKey, a])));
    this.expenseAccountOptions.set(
      selectable.map((a) => ({
        publicKey: a.publicKey,
        name: a.name,
        typeLabel: accountTypeLabel(a.accountType),
        accountType: a.accountType,
      })),
    );
    const keys = selectable.map((a) => a.publicKey);
    const preferred = this.dialogData?.initialAccountKey?.trim();
    const cur = this.form.controls.accountKey.value;
    if (preferred && keys.includes(preferred)) {
      this.form.patchValue({ accountKey: preferred });
    } else if (keys.length && !keys.includes(cur)) {
      this.form.patchValue({ accountKey: keys[0] });
    }
  }

  private initFormAfterLookups(cats: CategoryResponse[]): void {
    const routeId = this.route.snapshot.paramMap.get('id');
    const dialogRecurringId = this.dialogData?.recurringId;
    const dialogTxId = this.dialogData?.transactionId;
    const effectiveRecurringId =
      dialogRecurringId != null && dialogRecurringId > 0 ? dialogRecurringId : null;
    const effectiveId =
      routeId != null && routeId !== ''
        ? Number(routeId)
        : dialogTxId != null && dialogTxId > 0
          ? dialogTxId
          : null;

    if (effectiveRecurringId != null) {
      this.editingRecurringId = effectiveRecurringId;
      this.dialogTitle.set('Editar despesa');
      this.recurringTransactions.get(effectiveRecurringId).subscribe({
        next: (r) => this.applyRecurringToForm(r),
        error: () => {
          this.error.set('Não foi possível carregar a despesa fixa.');
          this.loading.set(false);
        },
      });
      return;
    }

    if (effectiveId != null) {
      this.editingId = effectiveId;
      if (!this.expenseLayout) {
        this.title.set('Editar transação');
      }
      this.transactions.get(effectiveId).subscribe({
        next: (t) => {
          const accountKey = t.accountPublicKey ?? 'principal';
          this.applyAccountOptions(this.allAccounts(), [accountKey]);
          const local = new Date(t.occurredAt);
          const pad = (n: number) => String(n).padStart(2, '0');
          const localStr = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`;
          this.form.patchValue({
            amount: t.amount,
            kind: t.kind,
            categoryId: t.categoryId,
            description: t.description ?? '',
            occurredAt: localStr,
            occurredDate: new Date(local.getFullYear(), local.getMonth(), local.getDate()),
            accountKey,
            showInPayables: !!t.showInPayables,
          });
          this.expensePaymentConfirmed.set(!!t.paidAt);
          this.splitDescriptionToSummaryNotes(t.description);
          this.applyFixaMetaFromDescription(t.description);
          const cents = Math.round(t.amount * 100);
          this.expenseAmountCents.set(cents);
          this.expenseAmountText.set(formatBrlAmountInput(t.amount));
          if (this.expenseLayout) {
            this.form.controls.occurredAt.clearValidators();
            this.form.controls.occurredDate.setValidators([Validators.required]);
            this.form.controls.occurredAt.updateValueAndValidity({ emitEvent: false });
            this.form.controls.occurredDate.updateValueAndValidity({ emitEvent: false });
            this.syncDialogTitleFromKind(t.kind);
            this.wireExpenseLayoutReactiveStreams();
          }
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Não foi possível carregar a transação.');
          this.loading.set(false);
        },
      });
      return;
    }

    const firstExpense = cats.find((c) => c.kind === 'EXPENSE') ?? cats[0];
    const firstIncome = cats.find((c) => c.kind === 'INCOME') ?? firstExpense;
    const initialKind = this.dialogData?.initialKind === 'INCOME' ? 'INCOME' : 'EXPENSE';
    const initialCategory = initialKind === 'INCOME' ? firstIncome : firstExpense;
    if (this.expenseLayout) {
      this.form.controls.occurredAt.clearValidators();
      this.form.controls.occurredDate.setValidators([Validators.required]);
      const today = new Date();
      const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      let occurredDate = todayDate;
      const initialDate = this.dialogData?.initialOccurredDate?.slice(0, 10);
      if (initialDate) {
        const [y, m, d] = initialDate.split('-').map(Number);
        if (y && m && d) {
          occurredDate = new Date(y, m - 1, d);
        }
      }
      const selectableKeys = new Set(this.expenseAccountOptions().map((a) => a.publicKey));
      const initialKey = this.dialogData?.initialAccountKey?.trim();
      const accountKey =
        initialKey && selectableKeys.has(initialKey)
          ? initialKey
          : this.form.controls.accountKey.value;
      this.title.set(initialKind === 'INCOME' ? 'Nova receita' : 'Nova despesa');
      this.dialogTitle.set(initialKind === 'INCOME' ? 'Nova receita' : 'Nova despesa');
      this.form.patchValue({
        kind: initialKind,
        occurredDate,
        occurredAt: '',
        categoryId: initialCategory?.id ?? 0,
        accountKey,
      });
      this.expenseAmountCents.set(0);
      this.expenseAmountText.set(formatBrlAmountInput(0));
      this.syncCreditCardPaymentDefaults();
      this.updateOccurredDateIsFuture(occurredDate);
      this.form.controls.occurredAt.updateValueAndValidity({ emitEvent: false });
      this.form.controls.occurredDate.updateValueAndValidity({ emitEvent: false });
      this.wireExpenseLayoutReactiveStreams();
    } else {
      this.title.set('Nova transação');
      this.form.controls.occurredDate.clearValidators();
      this.form.patchValue({ occurredDate: null });
      this.form.controls.occurredDate.updateValueAndValidity({ emitEvent: false });
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const localStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
      this.form.patchValue({
        occurredAt: localStr,
        categoryId: firstExpense?.id ?? 0,
        kind: (firstExpense?.kind as MoneyKind) ?? 'EXPENSE',
      });
    }
    this.loading.set(false);
  }

  private wireExpenseLayoutReactiveStreams(): void {
    merge(
      this.form.controls.repetition.valueChanges,
      this.form.controls.defineTotalOccurrences.valueChanges,
      this.form.controls.useParcelAmountMode.valueChanges,
      this.form.controls.parcelAmount.valueChanges,
      this.form.controls.installmentCount.valueChanges,
      this.form.controls.occurredDate.valueChanges,
      this.form.controls.showInPayables.valueChanges,
      this.form.controls.accountKey.valueChanges,
    )
      .pipe(startWith(null), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.syncParcelValidators();
        this.syncAmountNumericFromUi();
        this.updateOccurredDateIsFuture(this.form.controls.occurredDate.value);
        this.syncCreditCardPaymentDefaults();
        this.syncPayablesCheckboxWhenHidden();
        this.syncPaymentWhenPayablesChecked();
        this.applyCreditCardChargeDateFloor();
      });
  }

  private applyCreditCardChargeDateFloor(): void {
    if (!this.isCreateExpense() || !this.expenseLayout) {
      this.creditCardMinChargeDate.set(null);
      return;
    }
    const key = this.form.controls.accountKey.value?.trim() || 'principal';
    const api = this.accountsByKey().get(key);
    if (!api || api.accountType !== 'CREDIT_CARD') {
      this.creditCardMinChargeDate.set(null);
      return;
    }
    const acc = uiAccountFromApi(api);
    const min = minChargeDateForCreditCard(acc);
    this.creditCardMinChargeDate.set(min);
    if (!min) return;

    const cur = this.form.controls.occurredDate.value;
    if (!(cur instanceof Date) || Number.isNaN(cur.getTime())) return;
    const clamped = clampDateToOpenCreditCardCharge(acc, cur);
    if (clamped.getTime() === cur.getTime()) return;
    this.form.controls.occurredDate.setValue(clamped, { emitEvent: false });
    this.updateOccurredDateIsFuture(clamped);
  }

  private resolveCreditCardChargeDate(accountPublicKey: string, date: Date): Date {
    const api = this.accountsByKey().get(accountPublicKey.trim() || 'principal');
    if (!api || api.accountType !== 'CREDIT_CARD' || !this.isCreateExpense()) {
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }
    return clampDateToOpenCreditCardCharge(uiAccountFromApi(api), date);
  }

  private isCreditCardExpenseAccount(): boolean {
    if (this.dialogData?.creditCardInvoiceContext) return true;
    const key = this.form.controls.accountKey.value?.trim();
    if (!key) return false;
    return this.accountsByKey().get(key)?.accountType === 'CREDIT_CARD';
  }

  /** Compras no cartão ficam na fatura — não marcar como pagas na criação. */
  private syncCreditCardPaymentDefaults(): void {
    if (!this.isCreateExpense() || !this.expenseLayout) return;
    if (this.isCreditCardExpenseAccount()) {
      this.expensePaymentConfirmed.set(false);
      this.form.controls.showInPayables.setValue(false, { emitEvent: false });
      return;
    }
    if (!this.occurredDateIsFuture()) {
      this.expensePaymentConfirmed.set(true);
    }
  }

  /** Contas a pagar só faz sentido com pagamento pendente. */
  private syncPaymentWhenPayablesChecked(): void {
    if (!this.isCreateExpense() || !this.showPayablesOption()) return;
    if (this.form.controls.showInPayables.value) {
      this.expensePaymentConfirmed.set(false);
    }
  }

  isEditingRecurring(): boolean {
    return this.editingRecurringId != null;
  }

  isCreateExpense(): boolean {
    return this.editingId == null && this.editingRecurringId == null;
  }

  private updateOccurredDateIsFuture(date: Date | null): void {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      this.occurredDateIsFuture.set(false);
      return;
    }
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const selected = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const isFuture = selected.getTime() > todayStart.getTime();
    this.occurredDateIsFuture.set(isFuture);
    if (this.isCreateExpense() && isFuture) {
      this.expensePaymentConfirmed.set(false);
    }
  }

  private syncPayablesCheckboxWhenHidden(): void {
    if (!this.showPayablesOption()) {
      this.form.controls.showInPayables.setValue(false, { emitEvent: false });
      return;
    }
    if (this.isCreateExpense()) {
      this.form.controls.showInPayables.setValue(true, { emitEvent: false });
    }
  }

  togglePaymentConfirmed(): void {
    if (this.isEditingRecurring()) return;
    if (this.editingId != null) {
      if (!this.expensePaymentConfirmed()) {
        this.markAsPaidOnServer();
      }
      return;
    }
    this.expensePaymentConfirmed.update((v) => !v);
    if (this.expensePaymentConfirmed() && this.form.controls.showInPayables.value) {
      this.form.controls.showInPayables.setValue(false, { emitEvent: false });
    }
    this.syncPayablesCheckboxWhenHidden();
  }

  private markAsPaidOnServer(): void {
    if (this.editingId == null) return;
    this.transactions.markPaid(this.editingId).subscribe({
      next: () => {
        this.expensePaymentConfirmed.set(true);
        this.syncPayablesCheckboxWhenHidden();
        if (this.dialogRef) {
          this.dialogRef.close(true);
        }
      },
      error: (err) =>
        this.error.set(apiErrorMessage(err, 'Erro ao marcar como paga.')),
    });
  }

  private resolveShowInPayables(raw: boolean): boolean {
    if (!this.showPayablesOption()) return false;
    if (this.isCreateExpense()) return true;
    return raw;
  }

  private resolveMarkAsPaidOnCreate(occurredIso: string): boolean {
    if (this.isCreditCardExpenseAccount()) return false;
    if (!this.isCreateExpense() || !this.expensePaymentConfirmed()) return false;
    const when = new Date(occurredIso);
    if (Number.isNaN(when.getTime())) return true;
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const occurred = new Date(when.getFullYear(), when.getMonth(), when.getDate());
    return occurred.getTime() <= todayStart.getTime();
  }

  /** Primeira ocorrência de despesa fixa: só confirma pagamento se não for «contas a pagar». */
  private shouldMarkFixedOccurrencePaid(showInPayables: boolean): boolean {
    return this.expensePaymentConfirmed() && !showInPayables;
  }

  private applyRecurringToForm(r: RecurringTransactionResponse): void {
    const accountKey = r.accountPublicKey ?? 'principal';
    this.applyAccountOptions(this.allAccounts(), [accountKey]);
    const start = new Date(r.startAt);
    const startDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    this.form.patchValue({
      amount: r.amount,
      kind: r.kind,
      categoryId: r.categoryId,
      accountKey,
      showInPayables: !!r.showInPayables,
      occurredDate: startDate,
      repetition: 'FIXA',
      installmentPeriodicity: r.periodicity,
      parcelEveryMonths: r.everyN,
      defineTotalOccurrences: r.maxOccurrences != null,
      installmentCount: r.maxOccurrences ?? 2,
    });
    this.splitDescriptionToSummaryNotes(r.description);
    const cents = Math.round(r.amount * 100);
    this.expenseAmountCents.set(cents);
    this.expenseAmountText.set(formatBrlAmountInput(r.amount));
    this.form.controls.occurredAt.clearValidators();
    this.form.controls.occurredDate.setValidators([Validators.required]);
    this.form.controls.occurredAt.updateValueAndValidity({ emitEvent: false });
    this.form.controls.occurredDate.updateValueAndValidity({ emitEvent: false });
    this.syncParcelValidators();
    this.wireExpenseLayoutReactiveStreams();
    this.loading.set(false);
  }

  private applyFixaMetaFromDescription(desc: string | null): void {
    const fixa = parseFixaMeta(desc);
    if (!fixa) return;
    this.form.patchValue({
      repetition: 'FIXA',
      installmentPeriodicity: fixa.periodicity,
      parcelEveryMonths: fixa.everyN,
      defineTotalOccurrences: fixa.maxOccurrences != null,
      installmentCount: fixa.maxOccurrences ?? 2,
    });
    this.syncParcelValidators();
  }

  private splitDescriptionToSummaryNotes(desc: string | null): void {
    if (!desc) return;
    const lines = desc
      .split(/\n\n+/)
      .map((l) => l.trim())
      .filter((l) => !!l && !l.startsWith('Tags:') && !l.startsWith('['));
    if (!lines.length) return;
    const [summary, ...rest] = lines;
    this.form.patchValue({
      summary,
      notes: rest.join('\n\n'),
    });
  }

  private syncDialogTitleFromKind(kind: MoneyKind): void {
    if (!this.expenseLayout) return;
    const edit = this.editingId != null || this.editingRecurringId != null;
    this.dialogTitle.set(
      kind === 'EXPENSE' ? (edit ? 'Editar despesa' : 'Nova despesa') : edit ? 'Editar receita' : 'Nova receita',
    );
  }

  setDialogKind(kind: MoneyKind): void {
    const first = this.allCategories().find((c) => c.kind === kind);
    this.form.patchValue({ kind, categoryId: first?.id ?? 0 });
    this.syncDialogTitleFromKind(kind);
  }

  onKindChange(kind: MoneyKind): void {
    const first = this.allCategories().find((c) => c.kind === kind);
    this.form.patchValue({ categoryId: first?.id ?? 0 });
    if (this.expenseLayout) {
      this.syncDialogTitleFromKind(kind);
    }
  }

  onExpenseAmountFocus(ev: FocusEvent): void {
    placeAmountInputCursorAtEnd(ev.target as HTMLInputElement);
  }

  onExpenseAmountClick(ev: MouseEvent): void {
    placeAmountInputCursorAtEnd(ev.target as HTMLInputElement);
  }

  onExpenseAmountInput(ev: Event): void {
    const e = ev as InputEvent;
    const input = ev.target as HTMLInputElement;

    if (e.inputType === 'deleteContentBackward' || e.inputType === 'deleteContentForward') {
      this.expenseAmountCents.update((c) => Math.floor(c / 10));
    } else if (e.inputType === 'insertFromPaste') {
      const raw = input.value;
      if (/[,.]/.test(raw)) {
        const brl = parsePtBrAmountInput(raw);
        this.expenseAmountCents.set(Math.round(brl * 100));
      } else {
        const digits = raw.replace(/\D/g, '');
        this.expenseAmountCents.set(parseCentsFromDigitsString(digits));
      }
    } else if (e.inputType === 'insertText' && e.data) {
      const onlyDigits = e.data.replace(/\D/g, '');
      if (onlyDigits.length === 0) return;
      if (onlyDigits.length > 1) {
        if (/[,.]/.test(e.data ?? '')) {
          const brl = parsePtBrAmountInput(e.data ?? '');
          this.expenseAmountCents.set(Math.round(brl * 100));
        } else {
          this.expenseAmountCents.set(parseCentsFromDigitsString(onlyDigits));
        }
      } else {
        const d = parseInt(onlyDigits, 10);
        const prev = this.expenseAmountCents();
        const newDigits = input.value.replace(/\D/g, '');
        const parsed = parseCentsFromDigitsString(newDigits);
        const appended = prev * 10 + d;
        this.expenseAmountCents.set(appended === parsed ? appended : parsed);
      }
    } else {
      const raw = input.value;
      if (/[,.]/.test(raw)) {
        this.expenseAmountCents.set(Math.round(parsePtBrAmountInput(raw) * 100));
      } else {
        this.expenseAmountCents.set(parseCentsFromDigitsString(raw.replace(/\D/g, '')));
      }
    }

    const cents = this.expenseAmountCents();
    const unit = cents / 100;
    this.expenseAmountText.set(formatBrlAmountInput(unit));
    this.patchAmountFromDisplayUnit(unit);
    placeAmountInputCursorAtEnd(input);
  }

  onExpenseAmountBlur(): void {
    this.syncAmountNumericFromUi();
    const v = this.form.getRawValue();
    const display =
      v.repetition === 'PARCELADO' && v.useParcelAmountMode && v.parcelAmount > 0
        ? v.parcelAmount
        : v.amount;
    this.expenseAmountCents.set(Number.isFinite(display) ? Math.round(display * 100) : 0);
    this.expenseAmountText.set(formatBrlAmountInput(display));
    this.form.controls.amount.markAsTouched();
  }

  expenseAmountFieldLabel(): string {
    const v = this.form.getRawValue();
    return v.repetition === 'PARCELADO' && v.useParcelAmountMode
      ? 'Valor da parcela (R$)'
      : 'Valor (R$)';
  }

  /** Atualiza `amount` (total) e `parcelAmount` conforme o modo de entrada. */
  private patchAmountFromDisplayUnit(unit: number): void {
    const v = this.form.getRawValue();
    if (v.repetition === 'PARCELADO' && v.useParcelAmountMode && v.installmentCount > 0) {
      const total = Math.round(unit * v.installmentCount * 100) / 100;
      this.form.patchValue({ parcelAmount: unit, amount: total }, { emitEvent: false });
    } else {
      this.form.patchValue({ amount: unit, parcelAmount: 0 }, { emitEvent: false });
    }
    this.form.controls.amount.updateValueAndValidity({ emitEvent: true });
  }

  /**
   * Valor efetivo no layout despesa: total parcelado ou texto «Valor» (evita gravar com UI zerada).
   * Usado no botão Salvar e em `submit` porque `amount` pode ficar dessincronizado do texto mascarado.
   */
  amountBelowMin(): boolean {
    if (!this.expenseLayout) return false;
    const n = this.computeExpenseAmountNumber();
    return !Number.isFinite(n) || n < 0.01;
  }

  private computeExpenseAmountNumber(): number {
    const v = this.form.getRawValue();
    if (
      this.expenseLayout &&
      v.repetition === 'PARCELADO' &&
      v.useParcelAmountMode &&
      v.installmentCount > 0
    ) {
      const parcel = v.parcelAmount > 0 ? v.parcelAmount : this.expenseAmountCents() / 100;
      return Math.round(parcel * v.installmentCount * 100) / 100;
    }
    if (this.expenseLayout) {
      return this.expenseAmountCents() / 100;
    }
    return Math.round(parsePtBrAmountInput(this.expenseAmountText()) * 100) / 100;
  }

  /** Mantém `amount` (total) alinhado ao valor exibido (total ou parcela × n). */
  private syncAmountNumericFromUi(): void {
    if (!this.expenseLayout) return;
    const v = this.form.getRawValue();

    if (v.repetition === 'PARCELADO' && v.useParcelAmountMode && v.installmentCount > 0) {
      const parcel =
        v.parcelAmount > 0 ? v.parcelAmount : Math.round((this.expenseAmountCents() / 100) * 100) / 100;
      const total = Math.round(parcel * v.installmentCount * 100) / 100;
      this.expenseAmountCents.set(Math.round(parcel * 100));
      this.expenseAmountText.set(formatBrlAmountInput(parcel));
      this.form.patchValue({ amount: total, parcelAmount: parcel }, { emitEvent: false });
    } else {
      const total = Math.round((this.expenseAmountCents() / 100) * 100) / 100;
      this.form.patchValue({ amount: total, parcelAmount: 0 }, { emitEvent: false });
    }
    this.form.controls.amount.updateValueAndValidity({ emitEvent: true });
  }

  private syncParcelValidators(): void {
    if (!this.expenseLayout) return;
    const periodicity = this.form.controls.installmentPeriodicity;
    const every = this.form.controls.parcelEveryMonths;
    const count = this.form.controls.installmentCount;
    const init = this.form.controls.initialInstallment;
    const rep = this.form.controls.repetition.value;

    if (rep === 'PARCELADO') {
      periodicity.setValidators([Validators.required]);
      every.setValidators([Validators.required, Validators.min(1), Validators.max(120)]);
      count.setValidators([Validators.required, Validators.min(2), Validators.max(999)]);
      init.setValidators([Validators.required, Validators.min(1)]);
    } else if (rep === 'FIXA') {
      periodicity.setValidators([Validators.required]);
      every.setValidators([Validators.required, Validators.min(1), Validators.max(120)]);
      init.clearValidators();
      if (this.form.controls.defineTotalOccurrences.value) {
        count.setValidators([Validators.required, Validators.min(1), Validators.max(999)]);
      } else {
        count.clearValidators();
      }
    } else {
      [periodicity, every, count, init].forEach((c) => c.clearValidators());
    }
    if (rep !== 'PARCELADO') {
      this.form.controls.useParcelAmountMode.setValue(false, { emitEvent: false });
    }
    [periodicity, every, count, init].forEach((c) => c.updateValueAndValidity({ emitEvent: false }));
  }

  openRepetitionCustomize(): void {
    this.syncAmountNumericFromUi();
    const v = this.form.getRawValue();
    const totalForDialog = this.resolveExpenseTotalForDialog();
    const parcelForDialog =
      v.useParcelAmountMode && v.parcelAmount > 0
        ? v.parcelAmount
        : v.useParcelAmountMode
          ? this.expenseAmountCents() / 100
          : v.parcelAmount;
    const data: RepetitionCustomizeDialogData = {
      repetition: v.repetition,
      periodicity: v.installmentPeriodicity,
      everyNMonths: v.parcelEveryMonths,
      installmentCount: v.installmentCount,
      initialInstallment: v.initialInstallment,
      parcelAmount: parcelForDialog,
      useParcelAmountMode: v.useParcelAmountMode,
      defineTotalOccurrences: v.defineTotalOccurrences,
      totalAmount: totalForDialog,
    };
    this.overlayDialog
      .open(RepetitionCustomizeDialogComponent, {
        width: 'min(96vw, 440px)',
        maxWidth: '96vw',
        autoFocus: 'first-tabbable',
        panelClass: ['transaction-form-dialog-panel', 'repetition-customize-dialog-panel'],
        data,
      })
      .afterClosed()
      .subscribe((r?: RepetitionCustomizeDialogResult) => {
        if (!r) return;
        this.form.patchValue({
          repetition: r.repetition,
          installmentPeriodicity: r.periodicity,
          parcelEveryMonths: r.everyNMonths,
          installmentCount: r.installmentCount,
          initialInstallment: r.initialInstallment,
          parcelAmount: r.parcelAmount,
          useParcelAmountMode: r.useParcelAmountMode,
          defineTotalOccurrences: r.defineTotalOccurrences,
        });
        this.syncParcelValidators();
        if (r.repetition === 'PARCELADO' && r.useParcelAmountMode && r.parcelAmount > 0) {
          this.expenseAmountCents.set(Math.round(r.parcelAmount * 100));
        } else if (r.totalAmount > 0) {
          this.expenseAmountCents.set(Math.round(r.totalAmount * 100));
        }
        this.syncAmountNumericFromUi();
      });
  }

  /** Total atual do lançamento para pré-preencher o modal «Personalizar». */
  private resolveExpenseTotalForDialog(): number {
    const v = this.form.getRawValue();
    if (v.repetition === 'PARCELADO' && v.useParcelAmountMode && v.installmentCount > 0) {
      const parcel = v.parcelAmount > 0 ? v.parcelAmount : this.expenseAmountCents() / 100;
      return Math.round(parcel * v.installmentCount * 100) / 100;
    }
    const fromCents = this.expenseAmountCents() / 100;
    const fromForm = Number(v.amount) || 0;
    const fromText = parsePtBrAmountInput(this.expenseAmountText());
    return Math.max(fromCents, fromForm, fromText);
  }

  submit(): void {
    this.error.set(null);
    if (this.expenseLayout) {
      this.syncAmountNumericFromUi();
      if (this.amountBelowMin()) {
        this.error.set('Informe um valor igual ou superior a 0,01.');
        this.form.controls.amount.markAsTouched();
        this.form.markAllAsTouched();
        return;
      }
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const invoiceCtx = this.dialogData?.creditCardInvoiceContext;
    const accountPublicKey =
      invoiceCtx?.accountKey?.trim() || v.accountKey?.trim() || 'principal';

    let occurredIso: string;
    if (this.expenseLayout) {
      let d = v.occurredDate;
      if (!d || !(d instanceof Date) || Number.isNaN(d.getTime())) {
        this.error.set('Indique uma data válida.');
        return;
      }
      d = this.resolveCreditCardChargeDate(accountPublicKey, d);
      const pad = (n: number) => String(n).padStart(2, '0');
      const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      occurredIso = new Date(`${ymd}T12:00:00`).toISOString();
    } else {
      occurredIso = new Date(v.occurredAt).toISOString();
    }

    const description = this.buildDescription(v);

    let amount = v.amount;
    if (
      this.expenseLayout &&
      v.repetition === 'PARCELADO' &&
      v.useParcelAmountMode &&
      v.parcelAmount > 0 &&
      v.installmentCount > 0
    ) {
      amount = Math.round(v.parcelAmount * v.installmentCount * 100) / 100;
    }

    const showInPayables = this.resolveShowInPayables(!!v.showInPayables);
    const markAsPaid = this.resolveMarkAsPaidOnCreate(occurredIso);

    const body: TransactionRequest = {
      amount,
      kind: v.kind,
      categoryId: v.categoryId,
      accountPublicKey,
      description,
      occurredAt: occurredIso,
      showInPayables,
      markAsPaid: markAsPaid || undefined,
    };

    let req$: Observable<void>;
    if (this.editingRecurringId != null) {
      req$ = this.recurringTransactions
        .update(this.editingRecurringId, {
          amount: v.amount,
          kind: v.kind,
          categoryId: v.categoryId,
          accountPublicKey: v.accountKey?.trim() || 'principal',
          description,
          startAt: occurredIso,
          periodicity: v.installmentPeriodicity ?? 'MENSAL',
          everyN: v.parcelEveryMonths ?? 1,
          maxOccurrences:
            v.defineTotalOccurrences && (v.installmentCount ?? 0) >= 1 ? v.installmentCount : null,
          showInPayables,
        })
        .pipe(map(() => void 0));
    } else if (this.editingId != null) {
      req$ = this.transactions.update(this.editingId, body).pipe(map(() => void 0));
    } else if (this.shouldCreateInstallments(v)) {
      const installmentGroupId = crypto.randomUUID();
      req$ = forkJoin(
        buildInstallmentTransactions({
          startDate: this.resolveExpenseStartDate(v, occurredIso),
          kind: v.kind,
          categoryId: v.categoryId,
          accountPublicKey,
          baseDescription: description,
          installmentCount: v.installmentCount,
          initialInstallment: v.initialInstallment,
          parcelEveryMonths: v.parcelEveryMonths,
          periodicity: v.installmentPeriodicity,
          parcelAmount: v.parcelAmount,
          useParcelAmountMode: v.useParcelAmountMode,
          totalAmount: amount,
          installmentGroupId,
          showInPayables,
        }).map((installment) =>
          this.transactions.create({
            ...installment,
            showInPayables: this.resolveShowInPayables(!!installment.showInPayables),
            markAsPaid:
              !this.isCreditCardExpenseAccount() &&
              this.expensePaymentConfirmed() &&
              !this.isInstallmentDateFuture(installment.occurredAt)
                ? true
                : undefined,
          }),
        ),
      ).pipe(map(() => void 0));
    } else if (this.shouldCreateFixedRecurring(v)) {
      req$ = this.recurringTransactions
        .create({
          amount: v.amount,
          kind: v.kind,
          categoryId: v.categoryId,
          accountPublicKey,
          description,
          startAt: occurredIso,
          periodicity: v.installmentPeriodicity ?? 'MENSAL',
          everyN: v.parcelEveryMonths ?? 1,
          maxOccurrences:
            v.defineTotalOccurrences && (v.installmentCount ?? 0) >= 1 ? v.installmentCount : null,
          showInPayables,
        })
        .pipe(
          switchMap((created) => {
            if (!this.shouldMarkFixedOccurrencePaid(showInPayables)) {
              return of(void 0);
            }
            return this.transactions
              .markOccurrencePaid({
                occurredAt: occurredIso,
                recurringId: created.id,
              })
              .pipe(map(() => void 0));
          }),
        );
    } else {
      req$ = this.transactions.create(body).pipe(map(() => void 0));
    }
    req$.subscribe({
      next: () => {
        if (this.dialogRef) {
          this.dialogRef.close(true);
        } else {
          void this.router.navigateByUrl('/transactions');
        }
      },
      error: (err) =>
        this.error.set(apiErrorMessage(err, 'Erro ao salvar a transação.')),
    });
  }

  private shouldCreateInstallments(v: {
    repetition?: 'UNICA' | 'PARCELADO' | 'FIXA';
    installmentCount?: number;
  }): boolean {
    return (
      this.expenseLayout &&
      this.editingId == null &&
      v.repetition === 'PARCELADO' &&
      (v.installmentCount ?? 0) >= 2
    );
  }

  private shouldCreateFixedRecurring(v: { repetition?: 'UNICA' | 'PARCELADO' | 'FIXA' }): boolean {
    return this.expenseLayout && this.editingId == null && v.repetition === 'FIXA';
  }

  private isInstallmentDateFuture(occurredIso: string): boolean {
    const when = new Date(occurredIso);
    if (Number.isNaN(when.getTime())) return false;
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const occurred = new Date(when.getFullYear(), when.getMonth(), when.getDate());
    return occurred.getTime() > todayStart.getTime();
  }

  private resolveExpenseStartDate(
    v: { occurredDate: Date | null },
    occurredIso: string,
  ): Date {
    const d = v.occurredDate;
    if (d instanceof Date && !Number.isNaN(d.getTime())) {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
    const parsed = new Date(occurredIso);
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  private buildDescription(v: {
    summary: string;
    notes: string;
    description: string;
    repetition?: 'UNICA' | 'PARCELADO' | 'FIXA';
    installmentPeriodicity?: InstallmentPeriodicity;
    parcelEveryMonths?: number;
    installmentCount?: number;
    initialInstallment?: number;
    parcelAmount?: number;
    useParcelAmountMode?: boolean;
    defineTotalOccurrences?: boolean;
  }): string | null {
    if (this.expenseLayout) {
      const summary = v.summary?.trim() ?? '';
      const notes = v.notes?.trim() ?? '';
      const parts: string[] = [];
      if (summary) parts.push(summary);
      if (notes) parts.push(notes);
      let out = parts.length ? parts.join('\n\n') : null;
      if (v.repetition === 'PARCELADO') {
        const p = v.installmentPeriodicity ?? 'MENSAL';
        const n = v.installmentCount ?? 0;
        const em = v.parcelEveryMonths ?? 1;
        const ini = v.initialInstallment ?? 1;
        const repLine = `[Parcelado: ${n}x, ${p}, a cada ${em} mês(es), parcela inicial ${ini}]`;
        out = out ? `${out}\n\n${repLine}` : repLine;
      } else if (v.repetition === 'FIXA') {
        const p = v.installmentPeriodicity ?? 'MENSAL';
        const em = v.parcelEveryMonths ?? 1;
        let repLine = `[Fixa: ${p}, a cada ${em}`;
        if (v.defineTotalOccurrences && (v.installmentCount ?? 0) >= 1) {
          repLine += `, ${v.installmentCount} ocorrências`;
        }
        repLine += ']';
        out = out ? `${out}\n\n${repLine}` : repLine;
      }
      return out;
    }
    return v.description?.trim() || null;
  }
}

function formatBrlAmountInput(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Limite prático de dígitos para centavos (evita `parseInt` impreciso). */
const MAX_EXPENSE_CENTS = 9_007_199_254_740_991;

function parseCentsFromDigitsString(digits: string): number {
  if (!digits) return 0;
  const capped = digits.length > 15 ? digits.slice(0, 15) : digits;
  const n = parseInt(capped, 10);
  if (!Number.isFinite(n)) return 0;
  return Math.min(n, MAX_EXPENSE_CENTS);
}

function parsePtBrAmountInput(s: string): number {
  let t = s.trim().replace(/\s/g, '').replace(/R\$/gi, '');
  if (!t || t === ',') return 0;
  if (t.endsWith(',')) t = t.slice(0, -1);
  if (t.endsWith('.')) t = t.slice(0, -1);
  if (t.includes(',')) {
    return Math.max(0, Number(t.replace(/\./g, '').replace(',', '.')) || 0);
  }
  return Math.max(0, Number(t) || 0);
}
