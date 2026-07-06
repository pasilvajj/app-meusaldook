import type { TransactionResponse } from '../../core/models/transaction.models';
import type { UiAccount } from './account.models';
import {
  clampDateToOpenCreditCardCharge,
  computeFutureInstallmentsTotal,
  firstChargeDayForOpenInvoice,
  groupFutureInstallmentsByInvoice,
  invoiceCycleForListing,
  invoiceViewMonthFromAccount,
  isInvoicePaymentInCycle,
  isTransactionInInvoiceCycle,
  isViewingOpenInvoiceMonth,
} from './credit-card-invoice.util';

function card(overrides: Partial<UiAccount> = {}): UiAccount {
  return {
    serverId: 1,
    publicKey: 'card-1',
    name: 'Cartão',
    accountType: 'CREDIT_CARD',
    active: true,
    statusLabel: 'Ativa',
    initialBalanceAmount: 5000,
    creditCardDueDay: 11,
    creditCardClosingDaysBeforeDue: 7,
    creditCardNextInvoiceDate: '2026-08-11',
    ...overrides,
  };
}

function expense(occurredAt: string, id = 1): TransactionResponse {
  return {
    id,
    amount: 100,
    kind: 'EXPENSE',
    categoryId: 1,
    categoryName: 'Bem Estar',
    accountPublicKey: 'card-1',
    accountName: 'Cartão',
    description: 'Tênis 1/2',
    occurredAt: `${occurredAt}T15:00:00.000Z`,
    createdAt: `${occurredAt}T15:00:00.000Z`,
    paidAt: null,
    projected: false,
  };
}

function invoicePayment(occurredAt: string, id = 90): TransactionResponse {
  return {
    ...expense(occurredAt, id),
    description: 'Pagamento fatura Cartão',
    accountPublicKey: 'principal',
    accountName: 'Conta principal',
    paidAt: `${occurredAt}T15:00:00.000Z`,
  };
}

function formatLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('credit-card-invoice.util', () => {
  const july4 = new Date(2026, 6, 4, 12, 0, 0, 0);

  it('isViewingOpenInvoiceMonth identifica fatura aberta', () => {
    const acc = card({ creditCardNextInvoiceDate: '2026-08-11' });
    expect(isViewingOpenInvoiceMonth(acc, 2026, 8)).toBe(true);
    expect(isViewingOpenInvoiceMonth(acc, 2026, 7)).toBe(false);
  });

  it('após fechar julho no dia 4, fatura aberta é agosto', () => {
    const acc = card({ creditCardNextInvoiceDate: '2026-08-11' });
    expect(invoiceViewMonthFromAccount(acc)).toEqual({ year: 2026, month: 8 });
  });

  it('após fechar julho no dia 4, nova compra começa no dia do fechamento (04/07)', () => {
    const acc = card({ creditCardNextInvoiceDate: '2026-08-11' });
    expect(firstChargeDayForOpenInvoice(acc, july4)).toBe('2026-07-04');
  });

  it('fatura de agosto (aberta) cobre de 04/07 a 03/08', () => {
    const acc = card({ creditCardNextInvoiceDate: '2026-08-11' });
    const august = invoiceCycleForListing(acc, 2026, 8)!;
    expect(august.periodStartIso).toBe('2026-07-04');
    expect(august.periodEndIso).toBe('2026-08-03');
    expect(isTransactionInInvoiceCycle(expense('2026-07-04'), august)).toBe(true);
    expect(isTransactionInInvoiceCycle(expense('2026-07-03'), august)).toBe(false);
    expect(isTransactionInInvoiceCycle(expense('2026-08-04'), august)).toBe(false);
  });

  it('fatura de julho (fechada) termina em 03/07 — dia 04/07 é da fatura aberta', () => {
    const acc = card({ creditCardNextInvoiceDate: '2026-08-11' });
    const july = invoiceCycleForListing(acc, 2026, 7)!;
    expect(july.periodEndIso).toBe('2026-07-03');
    expect(isTransactionInInvoiceCycle(expense('2026-07-03'), july)).toBe(true);
    expect(isTransactionInInvoiceCycle(expense('2026-07-04'), july)).toBe(false);
  });

  it('compra 3x em 04/07: uma parcela por fatura (ago, set, out)', () => {
    const acc = card({ creditCardNextInvoiceDate: '2026-08-11' });
    const august = invoiceCycleForListing(acc, 2026, 8)!;
    const september = invoiceCycleForListing(acc, 2026, 9)!;
    const october = invoiceCycleForListing(acc, 2026, 10)!;
    const p1 = expense('2026-07-04', 1);
    const p2 = expense('2026-08-04', 2);
    const p3 = expense('2026-09-04', 3);

    expect(isTransactionInInvoiceCycle(p1, august)).toBe(true);
    expect(isTransactionInInvoiceCycle(p2, august)).toBe(false);
    expect(isTransactionInInvoiceCycle(p3, august)).toBe(false);

    expect(isTransactionInInvoiceCycle(p1, september)).toBe(false);
    expect(isTransactionInInvoiceCycle(p2, september)).toBe(true);
    expect(isTransactionInInvoiceCycle(p3, september)).toBe(false);

    expect(isTransactionInInvoiceCycle(p1, october)).toBe(false);
    expect(isTransactionInInvoiceCycle(p2, october)).toBe(false);
    expect(isTransactionInInvoiceCycle(p3, october)).toBe(true);
  });

  it('na fatura aberta de agosto, parcelas futuras somam compras após 03/08', () => {
    const acc = card({ creditCardNextInvoiceDate: '2026-08-11' });
    const august = invoiceCycleForListing(acc, 2026, 8)!;
    const total = computeFutureInstallmentsTotal(
      [expense('2026-08-04', 1), expense('2026-09-04', 2)],
      august,
    );
    expect(total).toBe(-200);
  });

  it('agrupa parcelas futuras por fatura de destino (set e out)', () => {
    const acc = card({ creditCardNextInvoiceDate: '2026-08-11' });
    const august = invoiceCycleForListing(acc, 2026, 8)!;
    const groups = groupFutureInstallmentsByInvoice(
      acc,
      [expense('2026-08-04', 2), expense('2026-09-04', 3)],
      august,
    );
    expect(groups.length).toBe(2);
    expect(groups[0].month).toBe(9);
    expect(groups[0].total).toBe(-100);
    expect(groups[0].transactions.map((t) => t.id)).toEqual([2]);
    expect(groups[1].month).toBe(10);
    expect(groups[1].transactions.map((t) => t.id)).toEqual([3]);
  });

  it('pagamento em 11/07 conta só na fatura de julho (não repete em ago/set)', () => {
    const acc = card({ creditCardNextInvoiceDate: '2026-10-11' });
    const july = invoiceCycleForListing(acc, 2026, 7)!;
    const august = invoiceCycleForListing(acc, 2026, 8)!;
    const september = invoiceCycleForListing(acc, 2026, 9)!;
    const payment = invoicePayment('2026-07-11');

    expect(isInvoicePaymentInCycle(payment, 'Cartão', july, 'card-1')).toBe(true);
    expect(isInvoicePaymentInCycle(payment, 'Cartão', august, 'card-1')).toBe(false);
    expect(isInvoicePaymentInCycle(payment, 'Cartão', september, 'card-1')).toBe(false);
  });

  it('pagamento no dia do fechamento seguinte pertence à fatura seguinte', () => {
    const acc = card({ creditCardNextInvoiceDate: '2026-10-11' });
    const july = invoiceCycleForListing(acc, 2026, 7)!;
    const august = invoiceCycleForListing(acc, 2026, 8)!;
    const payment = invoicePayment('2026-08-04');

    expect(isInvoicePaymentInCycle(payment, 'Cartão', july, 'card-1')).toBe(false);
    expect(isInvoicePaymentInCycle(payment, 'Cartão', august, 'card-1')).toBe(true);
  });

  it('pagamento em 11/07 pertence só à fatura de julho', () => {
    const acc = card({ creditCardNextInvoiceDate: '2026-08-11' });
    const payment: TransactionResponse = {
      ...expense('2026-07-11', 99),
      description: 'Pagamento fatura Cartão',
      paidAt: '2026-07-11T15:00:00.000Z',
    };
    const july = invoiceCycleForListing(acc, 2026, 7)!;
    const august = invoiceCycleForListing(acc, 2026, 8)!;
    const september = invoiceCycleForListing(acc, 2026, 9)!;
    expect(isInvoicePaymentInCycle(payment, 'Cartão', july, 'card-1')).toBe(true);
    expect(isInvoicePaymentInCycle(payment, 'Cartão', august, 'card-1')).toBe(false);
    expect(isInvoicePaymentInCycle(payment, 'Cartão', september, 'card-1')).toBe(false);
  });

  it('pagamento no dia do fechamento (04/08) pertence à fatura de agosto', () => {
    const acc = card({ creditCardNextInvoiceDate: '2026-08-11' });
    const payment: TransactionResponse = {
      ...expense('2026-08-04', 98),
      description: 'Pagamento fatura Cartão',
      paidAt: '2026-08-04T15:00:00.000Z',
    };
    const july = invoiceCycleForListing(acc, 2026, 7)!;
    const august = invoiceCycleForListing(acc, 2026, 8)!;
    expect(isInvoicePaymentInCycle(payment, 'Cartão', july, 'card-1')).toBe(false);
    expect(isInvoicePaymentInCycle(payment, 'Cartão', august, 'card-1')).toBe(true);
  });

  it('pagamento no vencimento 11/07 pertence só à fatura de julho', () => {
    const acc = card({ creditCardNextInvoiceDate: '2026-10-11' });
    const payment: TransactionResponse = {
      ...expense('2026-07-11', 9),
      description: 'Pagamento fatura Cartão',
      paidAt: '2026-07-11T15:00:00.000Z',
    };
    const july = invoiceCycleForListing(acc, 2026, 7)!;
    const august = invoiceCycleForListing(acc, 2026, 8)!;
    const september = invoiceCycleForListing(acc, 2026, 9)!;
    expect(isInvoicePaymentInCycle(payment, 'Cartão', july, 'card-1')).toBe(true);
    expect(isInvoicePaymentInCycle(payment, 'Cartão', august, 'card-1')).toBe(false);
    expect(isInvoicePaymentInCycle(payment, 'Cartão', september, 'card-1')).toBe(false);
  });

  it('pagamento atrasado (antes do fechamento seguinte) ainda é da fatura de julho', () => {
    const acc = card({ creditCardNextInvoiceDate: '2026-10-11' });
    const payment: TransactionResponse = {
      ...expense('2026-08-03', 10),
      description: 'Pagamento fatura Cartão',
      paidAt: '2026-08-03T15:00:00.000Z',
    };
    const july = invoiceCycleForListing(acc, 2026, 7)!;
    const august = invoiceCycleForListing(acc, 2026, 8)!;
    expect(isInvoicePaymentInCycle(payment, 'Cartão', july, 'card-1')).toBe(true);
    expect(isInvoicePaymentInCycle(payment, 'Cartão', august, 'card-1')).toBe(false);
  });

  it('clampDateToOpenCreditCardCharge mantém compra no dia do fechamento', () => {
    const acc = card({ creditCardNextInvoiceDate: '2026-08-11' });
    const clamped = clampDateToOpenCreditCardCharge(acc, july4, july4);
    expect(formatLocal(clamped)).toBe('2026-07-04');
  });
});
