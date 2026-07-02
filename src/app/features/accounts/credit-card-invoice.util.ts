import type { TransactionResponse } from '../../core/models/transaction.models';
import type { UiAccount } from './account.models';

/** Cálculos de vencimento/fechamento de fatura do cartão de crédito. */

export interface InvoiceCycle {
  closingIso: string;
  dueIso: string;
  periodStartIso: string;
  periodEndIso: string;
}

export interface CreditCardInvoiceSummary {
  cycle: InvoiceCycle;
  limit: number;
  used: number;
  available: number;
  invoiceTotal: number;
  previousBalance: number;
  totalPaid: number;
  amountToPay: number;
  expenses: number;
  reconciled: number;
  unreconciled: number;
  fixedExpenses: number;
  futureInstallments: number;
}

export function clampDueDay(dueDay: number, year: number, month: number): number {
  const last = new Date(year, month, 0).getDate();
  return Math.min(Math.max(1, Math.trunc(dueDay)), last);
}

export function defaultNextInvoiceIso(dueDay: number, reference = new Date()): string {
  const y = reference.getFullYear();
  const m = reference.getMonth() + 1;
  const thisMonthDom = clampDueDay(dueDay, y, m);
  const thisMonth = new Date(y, m - 1, thisMonthDom, 12, 0, 0, 0);
  const refDay = new Date(y, reference.getMonth(), reference.getDate(), 12, 0, 0, 0);
  if (thisMonth >= refDay) {
    return toIsoDate(thisMonth);
  }
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const nextDom = clampDueDay(dueDay, ny, nm);
  return toIsoDate(new Date(ny, nm - 1, nextDom, 12, 0, 0, 0));
}

export function invoiceClosingIso(nextInvoiceIso: string, closingDaysBeforeDue: number): string {
  const [y, m, d] = nextInvoiceIso.slice(0, 10).split('-').map(Number);
  const due = new Date(y, m - 1, d, 12, 0, 0, 0);
  due.setDate(due.getDate() - Math.max(0, Math.trunc(closingDaysBeforeDue)));
  return toIsoDate(due);
}

export function formatBrDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function formatBrAmount(value: number): string {
  const v = Number.isFinite(value) ? value : 0;
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDdMmIso(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}`;
}

export function creditCardLimit(acc: UiAccount): number {
  return Math.abs(Number(acc.initialBalanceAmount ?? 0));
}

export function invoiceCycleForViewMonth(acc: UiAccount, year: number, month: number): InvoiceCycle | null {
  const dueDay = acc.creditCardDueDay;
  if (!dueDay || dueDay < 1 || dueDay > 31) return null;
  const closingDays = acc.creditCardClosingDaysBeforeDue ?? 10;

  const due = new Date(year, month - 1, clampDueDay(dueDay, year, month), 12, 0, 0, 0);
  const closing = new Date(due);
  closing.setDate(closing.getDate() - closingDays);

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevDue = new Date(prevYear, prevMonth - 1, clampDueDay(dueDay, prevYear, prevMonth), 12, 0, 0, 0);
  const prevClosing = new Date(prevDue);
  prevClosing.setDate(prevClosing.getDate() - closingDays);

  const periodStart = new Date(prevClosing);
  periodStart.setDate(periodStart.getDate() + 1);
  periodStart.setHours(0, 0, 0, 0);

  const periodEnd = new Date(closing);
  periodEnd.setHours(23, 59, 59, 999);

  return {
    closingIso: toIsoDate(closing),
    dueIso: toIsoDate(due),
    periodStartIso: toIsoDate(periodStart),
    periodEndIso: toIsoDate(periodEnd),
  };
}

export function invoiceLabel(cycle: InvoiceCycle): string {
  return `Fatura ${formatBrDate(cycle.dueIso)} (Fechamento ${formatBrDate(cycle.closingIso)})`;
}

export function computeCreditCardInvoiceSummary(
  acc: UiAccount,
  txs: TransactionResponse[],
  cycle: InvoiceCycle,
): CreditCardInvoiceSummary {
  const start = parseIsoStart(cycle.periodStartIso);
  const end = parseIsoEnd(cycle.periodEndIso);

  let expenseSum = 0;
  let reconciled = 0;
  let unreconciled = 0;
  let fixedExpenses = 0;
  let futureInstallments = 0;

  const now = Date.now();
  for (const t of txs) {
    if (t.kind !== 'EXPENSE') continue;
    const at = new Date(t.occurredAt).getTime();
    if (at < start || at > end) continue;
    const amt = Math.abs(Number(t.amount) || 0);
    expenseSum += amt;
    const isProjected = Boolean(t.projected);
    if (isProjected) {
      unreconciled += amt;
      if (at > now) futureInstallments += amt;
    } else {
      reconciled += amt;
    }
    if (t.recurringId) fixedExpenses += amt;
  }

  const used = expenseSum;
  const limit = creditCardLimit(acc);
  const available = Math.max(0, limit - used);
  const invoiceTotal = used > 0 ? -used : 0;

  return {
    cycle,
    limit,
    used,
    available,
    invoiceTotal,
    previousBalance: 0,
    totalPaid: 0,
    amountToPay: invoiceTotal,
    expenses: invoiceTotal,
    reconciled: reconciled > 0 ? -reconciled : 0,
    unreconciled: unreconciled > 0 ? -unreconciled : 0,
    fixedExpenses: fixedExpenses > 0 ? -fixedExpenses : 0,
    futureInstallments: futureInstallments > 0 ? -futureInstallments : 0,
  };
}

export function txDateLabel(occurredAt: string): string {
  const day = occurredAt.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  return day === today ? 'hoje' : formatDdMmIso(day);
}

function parseIsoStart(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

function parseIsoEnd(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
