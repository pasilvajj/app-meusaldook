import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { formatDueShortLabel } from './credit-card-invoice.util';
import { formatTransactionDescriptionLabel } from '../transactions/installment-utils';
import type { TransactionResponse } from '../../core/models/transaction.models';
import type { FutureInstallmentsDialogData } from './future-installments-dialog.models';

@Component({
  selector: 'app-future-installments-dialog',
  standalone: true,
  imports: [DecimalPipe, MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './future-installments-dialog.component.html',
  styleUrl: './future-installments-dialog.component.scss',
})
export class FutureInstallmentsDialogComponent {
  readonly data = inject<FutureInstallmentsDialogData>(MAT_DIALOG_DATA);

  readonly selectedIndex = signal(0);

  readonly selectedGroup = computed(() => this.data.groups[this.selectedIndex()] ?? null);

  monthLabel(dueIso: string): string {
    return formatDueShortLabel(dueIso);
  }

  txLabel(tx: TransactionResponse): string {
    return formatTransactionDescriptionLabel(tx.description) ?? tx.categoryName;
  }

  selectMonth(index: number): void {
    this.selectedIndex.set(index);
  }
}
