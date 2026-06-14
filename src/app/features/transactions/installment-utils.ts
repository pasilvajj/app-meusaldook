import type { TransactionResponse } from '../../core/models/transaction.models';

export interface InstallmentInfo {
  parcelNumber: number;
  totalParcels: number;
}

export function parseInstallmentFromDescription(description: string | null | undefined): InstallmentInfo | null {
  if (!description) return null;
  const match = description.match(/\[Parcela (\d+)\/(\d+)\]/i);
  if (!match) return null;
  return { parcelNumber: Number(match[1]), totalParcels: Number(match[2]) };
}

export function isInstallmentTransaction(tx: TransactionResponse): boolean {
  return !!tx.installmentGroupId || parseInstallmentFromDescription(tx.description) != null;
}

export function installmentDeleteConfirmMessage(
  tx: TransactionResponse,
  fallback = 'Eliminar esta transação?',
): string {
  const info = parseInstallmentFromDescription(tx.description);
  if (tx.installmentGroupId || info) {
    const total = info?.totalParcels;
    return total
      ? `Esta despesa faz parte de um parcelamento. Eliminar todas as ${total} parcelas?`
      : 'Esta despesa faz parte de um parcelamento. Eliminar todas as parcelas?';
  }
  return fallback;
}
