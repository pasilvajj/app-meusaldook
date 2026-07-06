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

/** Mês/ano de referência da fatura aberta (vencimento da próxima fatura). */
export function invoiceViewMonthFromAccount(acc: UiAccount): { year: number; month: number } | null {
  const iso = acc.creditCardNextInvoiceDate?.slice(0, 10);
  if (!iso) return null;
  const [y, m] = iso.split('-').map(Number);
  if (!y || m < 1 || m > 12) return null;
  return { year: y, month: m };
}

export function isViewingOpenInvoiceMonth(
  acc: UiAccount,
  year: number,
  month: number,
): boolean {
  const open = invoiceViewMonthFromAccount(acc);
  return open?.year === year && open?.month === month;
}

export function dayBeforeIso(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const prev = new Date(y, m - 1, d - 1, 12, 0, 0, 0);
  return formatLocalIsoDate(prev);
}

/**
 * Primeiro dia em que novas compras entram na fatura aberta.
 * Após fechar no dia do fechamento, novas compras contam a partir desse dia (não no dia seguinte).
 */
export function firstChargeDayForOpenInvoice(
  acc: UiAccount,
  reference = new Date(),
): string {
  const open = invoiceViewMonthFromAccount(acc);
  if (!open) return formatLocalIsoDate(reference);

  const openCycle = invoiceCycleForListing(acc, open.year, open.month);
  if (!openCycle) return formatLocalIsoDate(reference);

  const chargeStart = openCycle.periodStartIso.slice(0, 10);
  const periodEnd = openCycle.periodEndIso.slice(0, 10);
  const today = formatLocalIsoDate(reference);

  if (today < chargeStart) return chargeStart;
  if (today > periodEnd) return periodEnd;
  return today;
}

/** Data mínima para nova compra no cartão (fatura aberta). */
export function minChargeDateForCreditCard(
  acc: Pick<
    UiAccount,
    'accountType' | 'creditCardDueDay' | 'creditCardNextInvoiceDate' | 'creditCardClosingDaysBeforeDue'
  >,
  reference = new Date(),
): Date | null {
  if (acc.accountType !== 'CREDIT_CARD' || !acc.creditCardNextInvoiceDate || !acc.creditCardDueDay) {
    return null;
  }
  const iso = firstChargeDayForOpenInvoice(acc as UiAccount, reference);
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/** Impede lançar compra em fatura já fechada — empurra para o primeiro dia da fatura aberta. */
export function clampDateToOpenCreditCardCharge(
  acc: Pick<
    UiAccount,
    'accountType' | 'creditCardDueDay' | 'creditCardNextInvoiceDate' | 'creditCardClosingDaysBeforeDue'
  >,
  date: Date,
  reference = new Date(),
): Date {
  const min = minChargeDateForCreditCard(acc, reference);
  if (!min) return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const selected = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (selected.getTime() < min.getTime()) {
    return new Date(min.getFullYear(), min.getMonth(), min.getDate());
  }
  return selected;
}

/**
 * Ciclo para listar/calcular a fatura do mês visualizado.
 * Regra uniforme: compras no dia do fechamento pertencem à fatura seguinte.
 * Cada fatura cobre [fechamento da fatura anterior, dia anterior ao próprio fechamento].
 */
export function invoiceCycleForListing(
  acc: UiAccount,
  year: number,
  month: number,
): InvoiceCycle | null {
  const strict = invoiceCycleForViewMonth(acc, year, month);
  if (!strict) return null;

  return {
    ...strict,
    // strict.periodStart = dia seguinte ao fechamento anterior → recua 1 dia.
    periodStartIso: dayBeforeIso(strict.periodStartIso),
    // strict.periodEnd = dia do próprio fechamento → esse dia já é da próxima fatura.
    periodEndIso: dayBeforeIso(strict.periodEndIso),
  };
}

export function occurredLocalDayIso(occurredAt: string): string {
  const d = new Date(occurredAt);
  return formatLocalIsoDate(d);
}

export function isTransactionInInvoiceCycle(
  tx: TransactionResponse,
  cycle: InvoiceCycle,
): boolean {
  const day = occurredLocalDayIso(tx.occurredAt);
  const start = cycle.periodStartIso.slice(0, 10);
  const end = cycle.periodEndIso.slice(0, 10);
  return day >= start && day <= end;
}

export function invoiceLabel(cycle: InvoiceCycle): string {
  return `Fatura ${formatBrDate(cycle.dueIso)} (Fechamento ${formatBrDate(cycle.closingIso)})`;
}

/** Próxima data de vencimento após fechar a fatura do ciclo informado. */
export function nextInvoiceAfterDue(dueIso: string, dueDay: number): string {
  const [y, m] = dueIso.slice(0, 10).split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return toIsoDate(new Date(ny, nm - 1, clampDueDay(dueDay, ny, nm), 12, 0, 0, 0));
}

/** Data padrão para novo lançamento dentro do período da fatura visualizada. */
export function defaultExpenseDateForInvoiceCycle(cycle: InvoiceCycle, reference = new Date()): Date {
  return clampDateToInvoiceCycle(cycle.periodStartIso, cycle.periodEndIso, reference);
}

/** Garante que a data caia no intervalo do ciclo de fatura (datas locais). */
export function clampDateToInvoiceCycle(periodStartIso: string, periodEndIso: string, date: Date): Date {
  const [sy, sm, sd] = periodStartIso.slice(0, 10).split('-').map(Number);
  const [ey, em, ed] = periodEndIso.slice(0, 10).split('-').map(Number);
  const start = new Date(sy, sm - 1, sd, 12, 0, 0, 0).getTime();
  const end = new Date(ey, em - 1, ed, 12, 0, 0, 0).getTime();
  const cur = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0).getTime();
  if (cur < start) return new Date(sy, sm - 1, sd);
  if (cur > end) return new Date(ey, em - 1, ed);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function localDayStartFromIso(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function localDayEndFromIso(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

export function formatLocalIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function invoicePaymentDescription(cardName: string): string {
  return `Pagamento fatura ${cardName}`;
}

export function invoicePaymentQueryRange(cycle: InvoiceCycle): { from: Date; to: Date } {
  const [sy, sm, sd] = cycle.periodStartIso.slice(0, 10).split('-').map(Number);
  const from = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
  from.setDate(from.getDate() - 31);
  const [y, m, d] = cycle.dueIso.slice(0, 10).split('-').map(Number);
  const to = new Date(y, m - 1, d + 30, 23, 59, 59, 999);
  return { from, to };
}

/** Intervalo após o fechamento do ciclo para buscar parcelas de faturas futuras. */
export function invoiceFutureInstallmentsQueryRange(cycle: InvoiceCycle): { from: Date; to: Date } {
  const end = localDayEndFromIso(cycle.periodEndIso);
  const from = new Date(end);
  from.setDate(from.getDate() + 1);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setFullYear(to.getFullYear() + 2);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

/** Soma parcelas com data após o fechamento do ciclo visualizado (próximas faturas). */
export function computeFutureInstallmentsTotal(
  txs: TransactionResponse[],
  cycle: InvoiceCycle,
): number {
  const end = cycle.periodEndIso.slice(0, 10);
  let sum = 0;
  for (const t of txs) {
    if (t.kind !== 'EXPENSE') continue;
    if (isInvoicePaymentTransaction(t)) continue;
    const day = occurredLocalDayIso(t.occurredAt);
    if (day <= end) continue;
    sum += Math.abs(Number(t.amount) || 0);
  }
  return sum > 0 ? -sum : 0;
}

export interface FutureInvoiceGroup {
  year: number;
  month: number;
  cycle: InvoiceCycle;
  /** Total do grupo, negativo (despesas). */
  total: number;
  transactions: TransactionResponse[];
}

/** Agrupa parcelas futuras (após o fim do ciclo visualizado) por fatura de destino. */
export function groupFutureInstallmentsByInvoice(
  acc: UiAccount,
  txs: TransactionResponse[],
  viewedCycle: InvoiceCycle,
): FutureInvoiceGroup[] {
  const end = viewedCycle.periodEndIso.slice(0, 10);
  const future = txs
    .filter(
      (t) =>
        t.kind === 'EXPENSE' &&
        !isInvoicePaymentTransaction(t) &&
        occurredLocalDayIso(t.occurredAt) > end,
    )
    .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
  if (!future.length) return [];

  const lastDay = occurredLocalDayIso(future[future.length - 1].occurredAt);
  const groups: FutureInvoiceGroup[] = [];
  let [year, month] = viewedCycle.dueIso.slice(0, 10).split('-').map(Number).slice(0, 2);

  for (let i = 0; i < 36; i++) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    const cycle = invoiceCycleForListing(acc, year, month);
    if (!cycle) break;
    const inCycle = future.filter((t) => isTransactionInInvoiceCycle(t, cycle));
    if (inCycle.length) {
      const sum = inCycle.reduce((acc2, t) => acc2 + Math.abs(Number(t.amount) || 0), 0);
      groups.push({ year, month, cycle, total: sum > 0 ? -sum : 0, transactions: inCycle });
    }
    if (cycle.periodEndIso.slice(0, 10) >= lastDay) break;
  }
  return groups;
}

const PT_BR_SHORT_MONTHS = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

/** «2026-09-11» → «11/set/26». */
export function formatDueShortLabel(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  const monthLabel = PT_BR_SHORT_MONTHS[Number(m) - 1] ?? m;
  return `${d}/${monthLabel}/${y.slice(2)}`;
}

/** «2026-09-11» → «11/09/26». */
export function formatDueNumericLabel(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

export function isInvoicePaymentForCard(
  tx: TransactionResponse,
  cardName: string,
  cardPublicKey?: string,
): boolean {
  if (tx.kind !== 'EXPENSE') return false;
  const desc = (tx.description ?? '').trim().toLowerCase();
  if (!desc.startsWith('pagamento fatura')) return false;
  const name = cardName.trim().toLowerCase();
  if (name && desc.includes(name)) return true;
  const key = cardPublicKey?.trim().toLowerCase();
  if (key && desc.includes(key)) return true;
  return desc === invoicePaymentDescription(cardName).toLowerCase();
}

/**
 * Janela de atribuição de pagamentos: cada pagamento pertence a exatamente uma fatura —
 * a que fechou mais recentemente. Vai do dia do fechamento desta fatura até a véspera
 * do fechamento da fatura seguinte.
 */
export function invoicePaymentAttributionWindow(
  cycle: InvoiceCycle,
): { fromIso: string; toIso: string } {
  const closingIso = cycle.closingIso.slice(0, 10);
  const dueIso = cycle.dueIso.slice(0, 10);

  const closingDays = diffLocalDays(closingIso, dueIso);
  const [dy, dm, dd] = dueIso.split('-').map(Number);
  const ny = dm === 12 ? dy + 1 : dy;
  const nm = dm === 12 ? 1 : dm + 1;
  const nextDue = new Date(ny, nm - 1, clampDueDay(dd, ny, nm), 12, 0, 0, 0);
  const nextClosing = new Date(nextDue);
  nextClosing.setDate(nextClosing.getDate() - closingDays);

  return { fromIso: closingIso, toIso: dayBeforeIso(toIsoDate(nextClosing)) };
}

export function isInvoicePaymentInCycle(
  tx: TransactionResponse,
  cardName: string,
  cycle: InvoiceCycle,
  cardPublicKey?: string,
): boolean {
  if (!isInvoicePaymentForCard(tx, cardName, cardPublicKey)) return false;
  const day = occurredLocalDayIso(tx.occurredAt);
  const window = invoicePaymentAttributionWindow(cycle);
  return day >= window.fromIso && day <= window.toIso;
}

export function findScheduledInvoicePayment(
  payments: TransactionResponse[],
  cardName: string,
  cycle: InvoiceCycle,
  cardPublicKey?: string,
): TransactionResponse | null {
  return (
    payments.find(
      (t) =>
        isInvoicePaymentInCycle(t, cardName, cycle, cardPublicKey) &&
        !t.paidAt &&
        t.id > 0 &&
        !t.projected,
    ) ?? null
  );
}

export function computeCreditCardInvoiceSummary(
  acc: UiAccount,
  txs: TransactionResponse[],
  cycle: InvoiceCycle,
  paymentTxs: TransactionResponse[] = [],
  futureInstallmentTxs: TransactionResponse[] = [],
  showFutureInstallmentsInDetail = false,
): CreditCardInvoiceSummary {
  const start = parseIsoStart(cycle.periodStartIso);
  const end = parseIsoEnd(cycle.periodEndIso);

  let expenseSum = 0;
  let reconciled = 0;
  let unreconciled = 0;
  let fixedExpenses = 0;

  for (const t of txs) {
    if (t.kind !== 'EXPENSE') continue;
    if (!isTransactionInInvoiceCycle(t, cycle)) continue;
    const at = new Date(t.occurredAt).getTime();
    if (at < start || at > end) continue;
    const amt = Math.abs(Number(t.amount) || 0);
    expenseSum += amt;
    const isProjected = Boolean(t.projected);
    if (isProjected) {
      unreconciled += amt;
    } else {
      reconciled += amt;
    }
    if (t.recurringId) fixedExpenses += amt;
  }

  const futureInstallments = showFutureInstallmentsInDetail
    ? computeFutureInstallmentsTotal(futureInstallmentTxs, cycle)
    : 0;

  const grossUsed = expenseSum;
  const limit = creditCardLimit(acc);
  const invoiceTotal = grossUsed > 0 ? -grossUsed : 0;

  const paidPayments = paymentTxs.filter(
    (t) => isInvoicePaymentInCycle(t, acc.name, cycle, acc.publicKey) && !!t.paidAt && t.id > 0,
  );
  const totalPaid = paidPayments.reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0);
  const outstanding = Math.max(0, grossUsed - totalPaid);
  const used = outstanding;
  const available = Math.max(0, limit - outstanding);
  const amountToPay = outstanding > 0 ? -outstanding : 0;

  return {
    cycle,
    limit,
    used,
    available,
    invoiceTotal,
    previousBalance: 0,
    totalPaid,
    amountToPay,
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

export function isInvoicePaymentTransaction(tx: TransactionResponse): boolean {
  return (tx.description ?? '').trim().toLowerCase().startsWith('pagamento fatura');
}

/** Caixa (byCategory) + compras no cartão das faturas abertas, agrupadas por categoria. */
export function mergeExpenseCategoriesForDonut(
  cashByCategory: { categoryName: string; total: number }[],
  openInvoiceTransactions: TransactionResponse[],
): { categoryName: string; total: number }[] {
  const map = new Map<string, number>();
  for (const c of cashByCategory) {
    const signed = expenseAmountAsNegative(c.total);
    if (signed === 0) continue;
    map.set(c.categoryName, (map.get(c.categoryName) ?? 0) + signed);
  }
  for (const tx of openInvoiceTransactions) {
    if (tx.kind !== 'EXPENSE') continue;
    if (isInvoicePaymentTransaction(tx)) continue;
    const name = tx.categoryName?.trim() || 'Sem categoria';
    const signed = expenseAmountAsNegative(tx.amount);
    if (signed === 0) continue;
    map.set(name, (map.get(name) ?? 0) + signed);
  }
  return [...map.entries()]
    .map(([categoryName, total]) => ({ categoryName, total }))
    .filter((r) => Math.abs(r.total) > 1e-9)
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

function expenseAmountAsNegative(amount: number): number {
  const abs = Math.abs(Number(amount) || 0);
  return abs === 0 ? 0 : -abs;
}

function diffLocalDays(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = toIso.slice(0, 10).split('-').map(Number);
  const from = new Date(fy, fm - 1, fd, 12, 0, 0, 0).getTime();
  const to = new Date(ty, tm - 1, td, 12, 0, 0, 0).getTime();
  return Math.round((to - from) / 86_400_000);
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
