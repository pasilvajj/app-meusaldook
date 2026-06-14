import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { TransactionApiService } from '../../core/services/transaction-api.service';
import type { TransactionResponse } from '../../core/models/transaction.models';
import type { InstallmentPeriodicity } from './repetition-customize-dialog.data';

/** Despesa fixa projetada, materializada (paga) ou âncora legada `[Fixa: ...]`. */
export function isFixedExpense(tx: TransactionResponse): boolean {
  if (tx.projected) return true;
  if (tx.recurringId != null) return true;
  return parseFixaMeta(tx.description) != null;
}

/** @deprecated Use {@link isFixedExpense}. */
export function isProjectedFixedExpense(tx: TransactionResponse): boolean {
  return isFixedExpense(tx);
}

export function fixedExpenseDeleteConfirmMessage(tx: TransactionResponse): string {
  return 'Esta é uma despesa fixa. Eliminar a regra e deixar de exibir todas as ocorrências?';
}

export interface FixaMeta {
  periodicity: InstallmentPeriodicity;
  everyN: number;
  maxOccurrences: number | null;
}

export function parseFixaMeta(description: string | null | undefined): FixaMeta | null {
  if (!description) return null;
  const match = description.match(/\[Fixa:\s*(MENSAL|SEMANAL|TRIMESTRAL),\s*a cada\s*(\d+)(?:,\s*(\d+)\s*ocorrências)?\]/i);
  if (!match) return null;
  return {
    periodicity: match[1].toUpperCase() as InstallmentPeriodicity,
    everyN: Number(match[2]),
    maxOccurrences: match[3] ? Number(match[3]) : null,
  };
}

export function resolveExpenseEditDialogData(
  tx: TransactionResponse,
): { recurringId?: number; transactionId?: number } {
  if (tx.recurringId) return { recurringId: tx.recurringId };
  if (tx.sourceTransactionId) return { transactionId: tx.sourceTransactionId };
  if (tx.id > 0) return { transactionId: tx.id };
  return {};
}

export function isExpensePaid(tx: TransactionResponse): boolean {
  return !!tx.paidAt;
}

export function canMarkExpensePaid(tx: TransactionResponse): boolean {
  return tx.kind === 'EXPENSE' && !isExpensePaid(tx);
}

export function markExpensePaid$(
  api: TransactionApiService,
  tx: TransactionResponse,
): Observable<void> {
  if (tx.id > 0 && !tx.projected) {
    return api.markPaid(tx.id).pipe(map(() => void 0));
  }
  return api.markOccurrencePaid({
    occurredAt: tx.occurredAt,
    recurringId: tx.recurringId ?? undefined,
    legacyTransactionId: tx.sourceTransactionId ?? undefined,
  });
}
