import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { forkJoin } from 'rxjs';
import { TransactionApiService } from '../../core/services/transaction-api.service';
import { formatDueNumericLabel } from './credit-card-invoice.util';
import { formatTransactionDescriptionLabel } from '../transactions/installment-utils';
import type { TransactionResponse } from '../../core/models/transaction.models';
import type {
  AnticipateInstallmentsDialogData,
  AnticipateInstallmentsDialogResult,
} from './future-installments-dialog.models';

interface AnticipateRow {
  tx: TransactionResponse;
  dueIso: string;
}

@Component({
  selector: 'app-anticipate-installments-dialog',
  standalone: true,
  imports: [
    DecimalPipe,
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    MatSnackBarModule,
  ],
  templateUrl: './anticipate-installments-dialog.component.html',
  styleUrl: './anticipate-installments-dialog.component.scss',
})
export class AnticipateInstallmentsDialogComponent {
  readonly data = inject<AnticipateInstallmentsDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(
    MatDialogRef<AnticipateInstallmentsDialogComponent, AnticipateInstallmentsDialogResult>,
  );
  private readonly txApi = inject(TransactionApiService);
  private readonly snack = inject(MatSnackBar);

  readonly saving = signal(false);
  readonly selectedIds = signal<ReadonlySet<number>>(new Set());

  /** Só parcelas persistidas podem ser antecipadas (projetadas ainda não existem no servidor). */
  readonly rows: AnticipateRow[] = this.data.groups.flatMap((g) =>
    g.transactions
      .filter((t) => t.id > 0 && !t.projected)
      .map((tx) => ({ tx, dueIso: g.cycle.dueIso })),
  );

  readonly selectedCount = computed(() => this.selectedIds().size);

  readonly selectedTotal = computed(() => {
    const ids = this.selectedIds();
    return this.rows
      .filter((r) => ids.has(r.tx.id))
      .reduce((sum, r) => sum + Math.abs(Number(r.tx.amount) || 0), 0);
  });

  dueLabel(iso: string): string {
    return formatDueNumericLabel(iso);
  }

  txLabel(tx: TransactionResponse): string {
    return formatTransactionDescriptionLabel(tx.description) ?? tx.categoryName;
  }

  isSelected(id: number): boolean {
    return this.selectedIds().has(id);
  }

  toggle(id: number, checked: boolean): void {
    const next = new Set(this.selectedIds());
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    this.selectedIds.set(next);
  }

  submit(): void {
    if (this.saving()) return;
    const ids = this.selectedIds();
    const selected = this.rows.filter((r) => ids.has(r.tx.id));
    if (!selected.length) {
      this.snack.open('Marque ao menos uma parcela para antecipar.', 'OK', { duration: 4000 });
      return;
    }

    this.saving.set(true);
    const occurredAt = this.anticipateOccurredAtIso();
    forkJoin(
      selected.map(({ tx }) =>
        this.txApi.update(tx.id, {
          amount: Math.abs(Number(tx.amount) || 0),
          kind: tx.kind,
          categoryId: tx.categoryId,
          accountPublicKey: tx.accountPublicKey,
          description: tx.description,
          occurredAt,
        }),
      ),
    ).subscribe({
      next: () => {
        this.snack.open(
          selected.length === 1
            ? 'Parcela antecipada para a fatura atual.'
            : `${selected.length} parcelas antecipadas para a fatura atual.`,
          'OK',
          { duration: 4000 },
        );
        this.dialogRef.close({ anticipated: true });
      },
      error: () => {
        this.saving.set(false);
        this.snack.open('Não foi possível antecipar as parcelas.', 'Fechar', { duration: 5000 });
      },
    });
  }

  private anticipateOccurredAtIso(): string {
    return new Date(`${this.data.anticipateToIso.slice(0, 10)}T12:00:00`).toISOString();
  }
}
