import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { catchError, of } from 'rxjs';
import type { AccountApiResponse } from '../../core/models/account-api.types';
import { AccountApiService } from '../../core/services/account-api.service';
import type { TransactionResponse } from '../../core/models/transaction.models';
import { formatBrDate } from '../accounts/credit-card-invoice.util';

export interface TransactionDetailsDialogData {
  tx: TransactionResponse;
  title: string;
}

type DetailViewMode = 'credit_card' | 'settled' | 'payable' | 'simple';

@Component({
  selector: 'app-transaction-details-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, DatePipe, DecimalPipe],
  templateUrl: './transaction-details-dialog.component.html',
  styleUrl: './transaction-details-dialog.component.scss',
})
export class TransactionDetailsDialogComponent implements OnInit {
  readonly data = inject(MAT_DIALOG_DATA) as TransactionDetailsDialogData;
  private readonly ref = inject(MatDialogRef<TransactionDetailsDialogComponent>);
  private readonly accountApi = inject(AccountApiService);

  readonly account = signal<AccountApiResponse | null>(null);

  readonly viewMode = computed<DetailViewMode>(() => {
    const tx = this.data.tx;
    const acc = this.account();
    if (acc?.accountType === 'CREDIT_CARD' && tx.kind === 'EXPENSE' && !tx.projected) {
      return 'credit_card';
    }
    if (tx.paidAt) return 'settled';
    if (tx.showInPayables) return 'payable';
    return 'simple';
  });

  ngOnInit(): void {
    this.accountApi
      .getByPublicKey(this.data.tx.accountPublicKey)
      .pipe(catchError(() => of(null)))
      .subscribe((acc) => this.account.set(acc));
  }

  amountSigned(): number {
    const v = Number(this.data.tx.amount) || 0;
    return this.data.tx.kind === 'INCOME' ? v : -v;
  }

  invoiceDueLabel(): string | null {
    const iso = this.account()?.creditCardNextInvoiceDate;
    return iso ? formatBrDate(iso) : null;
  }

  close(): void {
    this.ref.close();
  }

  edit(): void {
    this.ref.close('edit');
  }
}
