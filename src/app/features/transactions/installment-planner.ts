import type { TransactionRequest } from '../../core/models/transaction.models';
import type { MoneyKind } from '../../core/models/money-kind';
import type { InstallmentPeriodicity } from './repetition-customize-dialog.data';

export interface InstallmentPlanInput {
  startDate: Date;
  kind: MoneyKind;
  categoryId: number;
  accountPublicKey: string;
  baseDescription: string | null;
  installmentCount: number;
  initialInstallment: number;
  parcelEveryMonths: number;
  periodicity: InstallmentPeriodicity;
  parcelAmount: number;
  useParcelAmountMode: boolean;
  totalAmount: number;
  installmentGroupId: string;
  showInPayables?: boolean;
  markAsPaid?: boolean;
}

export function buildInstallmentTransactions(input: InstallmentPlanInput): TransactionRequest[] {
  const totalParcels = Math.max(2, Math.floor(input.installmentCount));
  const startParcel = Math.max(1, Math.floor(input.initialInstallment || 1));
  const parcelCount = Math.max(1, totalParcels - startParcel + 1);
  const every = Math.max(1, Math.floor(input.parcelEveryMonths || 1));

  const amounts = resolveInstallmentAmounts(input, totalParcels).slice(startParcel - 1);
  const requests: TransactionRequest[] = [];

  for (let i = 0; i < parcelCount; i++) {
    const parcelNumber = startParcel + i;
    const occurredAt = toOccurredIso(addByPeriod(input.startDate, input.periodicity, every, i));
    requests.push({
      amount: amounts[i] ?? amounts[amounts.length - 1] ?? input.totalAmount,
      kind: input.kind,
      categoryId: input.categoryId,
      accountPublicKey: input.accountPublicKey,
      description: withParcelLabel(input.baseDescription, parcelNumber, totalParcels),
      occurredAt,
      installmentGroupId: input.installmentGroupId,
      showInPayables: input.showInPayables,
      markAsPaid: input.markAsPaid,
    });
  }

  return requests;
}

function resolveInstallmentAmounts(input: InstallmentPlanInput, totalParcels: number): number[] {
  if (input.useParcelAmountMode && input.parcelAmount > 0) {
    return Array.from({ length: totalParcels }, () => roundMoney(input.parcelAmount));
  }
  return splitAmount(input.totalAmount, totalParcels);
}

function splitAmount(total: number, count: number): number[] {
  const safeTotal = roundMoney(Math.max(0, total));
  const safeCount = Math.max(1, count);
  const base = Math.floor((safeTotal / safeCount) * 100) / 100;
  const amounts = Array.from({ length: safeCount }, () => base);
  const assigned = roundMoney(base * safeCount);
  const remainder = roundMoney(safeTotal - assigned);
  amounts[amounts.length - 1] = roundMoney(amounts[amounts.length - 1] + remainder);
  return amounts;
}

function withParcelLabel(
  baseDescription: string | null,
  parcelNumber: number,
  totalParcels: number,
): string | null {
  const label = `Parcela ${parcelNumber}/${totalParcels}`;
  if (!baseDescription?.trim()) return label;
  return `${baseDescription.trim()}\n\n[${label}]`;
}

function addByPeriod(
  start: Date,
  periodicity: InstallmentPeriodicity,
  every: number,
  step: number,
): Date {
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  if (step === 0) return d;

  switch (periodicity) {
    case 'SEMANAL':
      d.setDate(d.getDate() + 7 * every * step);
      return d;
    case 'TRIMESTRAL':
      return addMonths(d, 3 * every * step);
    case 'MENSAL':
    default:
      return addMonths(d, every * step);
  }
}

function addMonths(date: Date, months: number): Date {
  const day = date.getDate();
  const d = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}

function toOccurredIso(date: Date): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const local = new Date(`${ymd}T${pad(now.getHours())}:${pad(now.getMinutes())}:00`);
  return local.toISOString();
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
