import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { TransactionResponse } from '../../core/models/transaction.models';

export interface TransactionDetailsDialogData {
  tx: TransactionResponse;
  title: string;
}

@Component({
  selector: 'app-transaction-details-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, DatePipe, DecimalPipe],
  templateUrl: './transaction-details-dialog.component.html',
  styleUrl: './transaction-details-dialog.component.scss',
})
export class TransactionDetailsDialogComponent {
  readonly data = inject(MAT_DIALOG_DATA) as TransactionDetailsDialogData;
  private readonly ref = inject(MatDialogRef<TransactionDetailsDialogComponent>);

  amountSigned(): number {
    const v = Number(this.data.tx.amount) || 0;
    return this.data.tx.kind === 'INCOME' ? v : -v;
  }

  close(): void {
    this.ref.close();
  }

  edit(): void {
    this.ref.close('edit');
  }
}
