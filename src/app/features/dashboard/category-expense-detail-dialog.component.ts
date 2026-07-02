import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { catchError, forkJoin, of, switchMap } from 'rxjs';
import { map } from 'rxjs/operators';
import { AccountApiService } from '../../core/services/account-api.service';
import { CategoryApiService } from '../../core/services/category-api.service';
import { TransactionApiService } from '../../core/services/transaction-api.service';
import { TransactionResponse } from '../../core/models/transaction.models';
import { CategoryExpenseDetailDialogData } from './category-expense-detail-dialog.models';
import { accountTypeLabel } from '../accounts/account.models';
import type { AccountType } from '../accounts/account.models';

@Component({
  selector: 'app-category-expense-detail-dialog',
  standalone: true,
  imports: [
    DecimalPipe,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './category-expense-detail-dialog.component.html',
  styleUrl: './category-expense-detail-dialog.component.scss',
})
export class CategoryExpenseDetailDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<CategoryExpenseDetailDialogComponent>);
  readonly data = inject<CategoryExpenseDetailDialogData>(MAT_DIALOG_DATA);
  private readonly txApi = inject(TransactionApiService);
  private readonly categoriesApi = inject(CategoryApiService);
  private readonly accountApi = inject(AccountApiService);

  readonly loading = signal(true);
  readonly transactions = signal<TransactionResponse[]>([]);
  readonly accountByKey = signal<Map<string, AccountRowMeta>>(new Map());

  readonly title = computed(() => `${this.data.categoryName} (${this.data.sharePct}%)`);

  readonly totalAmount = computed(() =>
    this.transactions().reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0),
  );

  ngOnInit(): void {
    const { year, month, categoryName } = this.data;
    const from = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const to = new Date(year, month, 0, 23, 59, 59, 999);

    forkJoin({
      categories: this.categoriesApi.list().pipe(catchError(() => of([]))),
      accounts: this.accountApi.list().pipe(catchError(() => of([]))),
    })
      .pipe(
        switchMap(({ categories, accounts }) => {
          const accountMap = new Map<string, AccountRowMeta>();
          for (const a of accounts) {
            accountMap.set(a.publicKey, {
              typeLabel: accountTypeLabel(a.accountType as AccountType),
            });
          }
          this.accountByKey.set(accountMap);

          const category = categories.find((c) => c.kind === 'EXPENSE' && c.name === categoryName);
          if (!category) {
            return of({ txs: [] as TransactionResponse[] });
          }

          const cardKeys = new Set(
            accounts.filter((a) => a.active && a.accountType === 'CREDIT_CARD').map((a) => a.publicKey),
          );
          const loads = [
            this.txApi.list({
              page: 0,
              size: 5000,
              from: from.toISOString(),
              to: to.toISOString(),
              categoryId: category.id,
              kind: 'EXPENSE',
              accountPublicKey: 'principal',
              includeProjected: true,
            }),
            ...[...cardKeys].map((publicKey) =>
              this.txApi.list({
                page: 0,
                size: 5000,
                from: from.toISOString(),
                to: to.toISOString(),
                categoryId: category.id,
                kind: 'EXPENSE',
                accountPublicKey: publicKey,
                includeProjected: true,
              }),
            ),
          ];

          if (!loads.length) {
            return of({ txs: [] as TransactionResponse[] });
          }

          return forkJoin(loads).pipe(
            map((pages) => {
              const seen = new Set<number>();
              const txs: TransactionResponse[] = [];
              for (const page of pages) {
                for (const tx of page.content) {
                  if (tx.kind !== 'EXPENSE') continue;
                  if (isCreditCardBillPayment(tx)) continue;
                  if (seen.has(tx.id)) continue;
                  seen.add(tx.id);
                  txs.push(tx);
                }
              }
              txs.sort(
                (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
              );
              return { txs };
            }),
            catchError(() => of({ txs: [] as TransactionResponse[] })),
          );
        }),
      )
      .subscribe({
        next: ({ txs }) => {
          this.transactions.set(txs);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  close(): void {
    this.dialogRef.close();
  }

  txnDay(occurredAt: string): string {
    const day = occurredAt.slice(0, 10);
    const [, m, d] = day.split('-');
    if (!m || !d) return day;
    return `${d}/${m}`;
  }

  txnTitle(tx: TransactionResponse): string {
    return tx.description?.trim() || tx.categoryName;
  }

  accountMeta(tx: TransactionResponse): AccountRowMeta {
    const fromMap = this.accountByKey().get(tx.accountPublicKey);
    if (fromMap) return fromMap;
    return {
      typeLabel: 'Conta corrente',
    };
  }

  amountSigned(tx: TransactionResponse): number {
    const n = Number(tx.amount) || 0;
    return n > 0 ? -n : n;
  }
}

function isCreditCardBillPayment(tx: TransactionResponse): boolean {
  const desc = (tx.description ?? '').trim().toLowerCase();
  return desc.startsWith('pagamento fatura');
}

interface AccountRowMeta {
  typeLabel: string;
}
