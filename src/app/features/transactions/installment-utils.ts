import type { TransactionResponse } from '../../core/models/transaction.models';

export interface InstallmentInfo {
  parcelNumber: number;
  totalParcels: number;
}

export function parseInstallmentFromDescription(description: string | null | undefined): InstallmentInfo | null {
  if (!description) return null;
  const match = description.match(/\[Parcela\s+(\d+)\/(\d+)\]/i);
  if (!match) return null;
  return { parcelNumber: Number(match[1]), totalParcels: Number(match[2]) };
}

function stripBracketTags(text: string): string {
  return text
    .replace(/\[[^\]]*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function descriptionBaseName(raw: string): string {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => !!l && !l.startsWith('Tags:'));
  for (const line of lines) {
    const cleaned = stripBracketTags(line);
    if (cleaned) return cleaned;
  }
  return stripBracketTags(lines.join(' '));
}

/** Rótulo curto para listas: «Cortina 1/2» em vez de metadados de parcelamento. */
export function formatTransactionDescriptionLabel(
  description: string | null | undefined,
  options?: { maxLength?: number },
): string | null {
  if (!description?.trim()) return null;
  const raw = description.trim();
  const installment = parseInstallmentFromDescription(raw);
  const base = descriptionBaseName(raw);

  let label: string;
  if (installment) {
    label = base
      ? `${base} ${installment.parcelNumber}/${installment.totalParcels}`
      : `${installment.parcelNumber}/${installment.totalParcels}`;
  } else if (base) {
    label = base;
  } else {
    return null;
  }

  const max = options?.maxLength;
  if (max != null && label.length > max) {
    return `${label.slice(0, max)}...`;
  }
  return label;
}

export function isInstallmentTransaction(tx: TransactionResponse): boolean {
  return !!tx.installmentGroupId || parseInstallmentFromDescription(tx.description) != null;
}

export function installmentDeleteConfirmMessage(
  tx: TransactionResponse,
  fallback = 'Excluir esta transação?',
): string {
  const info = parseInstallmentFromDescription(tx.description);
  if (tx.installmentGroupId || info) {
    const total = info?.totalParcels;
    return total
      ? `Esta despesa faz parte de um parcelamento. Excluir todas as ${total} parcelas?`
      : 'Esta despesa faz parte de um parcelamento. Excluir todas as parcelas?';
  }
  return fallback;
}
