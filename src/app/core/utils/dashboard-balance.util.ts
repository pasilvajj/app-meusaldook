import type { TransactionResponse } from '../models/transaction.models';
import type { UiAccount } from '../../features/accounts/account.models';

export interface CashBalanceRow {
  name: string;
  accountKey: string;
  confirmed: number;
  projected: number;
  accountType?: UiAccount['accountType'];
}

function isYyyyMmDayInMonth(isoDate: string, year: number, month: number): boolean {
  const day = isoDate.slice(0, 10);
  if (day.length < 10) return false;
  const [y, m] = day.split('-').map(Number);
  return y === year && m === month;
}

function openingDeltaInMonth(acc: UiAccount | null, year: number, month: number): number {
  if (!acc?.initialBalanceDate || !isYyyyMmDayInMonth(acc.initialBalanceDate, year, month)) return 0;
  const s = acc.initialBalance != null ? Number(acc.initialBalance) : 0;
  return Number.isFinite(s) ? s : 0;
}

/** Saldo líquido do mês (movimentos + abertura na data inicial, se cair no mês). */
export function computeAccountMonthEnd(
  year: number,
  month: number,
  txs: TransactionResponse[],
  acc: UiAccount | null,
): number {
  const lastDay = new Date(year, month, 0).getDate();
  const dayDelta = new Map<number, number>();

  const opening = openingDeltaInMonth(acc, year, month);
  if (opening !== 0 && acc?.initialBalanceDate) {
    const dom = Number(acc.initialBalanceDate.slice(8, 10));
    if (dom >= 1 && dom <= lastDay) {
      dayDelta.set(dom, (dayDelta.get(dom) ?? 0) + opening);
    }
  }

  for (const t of txs) {
    const d = new Date(t.occurredAt);
    if (d.getFullYear() !== year || d.getMonth() + 1 !== month) continue;
    const dom = d.getDate();
    const delta = t.kind === 'INCOME' ? Number(t.amount) : -Number(t.amount);
    dayDelta.set(dom, (dayDelta.get(dom) ?? 0) + delta);
  }

  let run = 0;
  for (let dom = 1; dom <= lastDay; dom++) {
    run += dayDelta.get(dom) ?? 0;
  }
  return run;
}

function isCashAccount(acc: UiAccount): boolean {
  return acc.active && acc.accountType !== 'CREDIT_CARD';
}

function balanceForAccount(
  acc: UiAccount,
  monthTransactions: TransactionResponse[],
  principalKey: string,
  goalResidue: number,
  year: number,
  month: number,
): CashBalanceRow {
  if (acc.accountType === 'PREPAID' && acc.currentBalance != null && Number.isFinite(acc.currentBalance)) {
    const bal = Number(acc.currentBalance);
    return {
      name: acc.name,
      accountKey: acc.publicKey,
      confirmed: bal,
      projected: bal,
      accountType: acc.accountType,
    };
  }

  const txs = monthTransactions.filter((t) => t.accountPublicKey === acc.publicKey);
  const accountEnd = computeAccountMonthEnd(year, month, txs, acc);
  const isPrincipal = acc.publicKey === principalKey;
  return {
    name: acc.name,
    accountKey: acc.publicKey,
    confirmed: accountEnd,
    projected: isPrincipal ? accountEnd + goalResidue : accountEnd,
    accountType: acc.accountType,
  };
}

/** Conta principal primeiro; demais contas de caixa ativas em ordem alfabética. */
export function buildCashBalanceRows(
  accounts: UiAccount[],
  monthTransactions: TransactionResponse[],
  principalKey: string,
  goalResidue: number,
  year: number,
  month: number,
): CashBalanceRow[] {
  const cashAccounts = accounts
    .filter(isCashAccount)
    .sort((a, b) => {
      if (a.publicKey === principalKey) return -1;
      if (b.publicKey === principalKey) return 1;
      return a.name.localeCompare(b.name, 'pt-BR');
    });

  return cashAccounts.map((acc) =>
    balanceForAccount(acc, monthTransactions, principalKey, goalResidue, year, month),
  );
}

export function monthRangeIso(year: number, month: number): { from: string; to: string } {
  const from = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const to = new Date(year, month, 0, 23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function countCashAccounts(accounts: UiAccount[]): number {
  return accounts.filter(isCashAccount).length;
}
