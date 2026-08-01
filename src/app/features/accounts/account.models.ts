/** Tipo de conta (UI + agrupamento na lista). */
export type AccountType = 'CHECKING' | 'PREPAID' | 'CREDIT_CARD' | 'CASH' | 'OTHER_ASSET';

/** Subtipo de conta pré-paga. */
export type PrepaidKind = 'MEAL_VOUCHER' | 'FOOD_VOUCHER';

export interface UiAccount {
  /** Identificador numérico na API (PATCH). */
  serverId: number;
  /** Chave estável (extrato, integrações); ex.: `principal`. */
  publicKey: string;
  name: string;
  active: boolean;
  statusLabel: string;
  currency?: string;
  accountType?: AccountType;
  prepaidKind?: PrepaidKind | null;
  /** Saldo atual (contas pré-pagas). */
  currentBalance?: number | null;
  initialBalance?: number | null;
  /** Valor absoluto do saldo na data inicial (natureza em `saldoCreditorDebtor`). */
  initialBalanceAmount?: number | null;
  /** ISO yyyy-MM-dd */
  initialBalanceDate?: string;
  saldoCreditorDebtor?: 'CREDITOR' | 'DEBTOR';
  considerBalanceMode?: 'IMMEDIATE' | 'PENDING';
  creditCardDueDay?: number | null;
  creditCardNextInvoiceDate?: string | null;
  creditCardClosingDaysBeforeDue?: number | null;
  notes?: string;
}

export interface UiAccountGroup {
  id: string;
  title: string;
  accounts: UiAccount[];
}

export interface AccountEditDialogData {
  account: UiAccount;
}

export const ACCOUNT_TYPE_OPTIONS: { id: AccountType; label: string }[] = [
  { id: 'CHECKING', label: 'Conta corrente' },
  { id: 'PREPAID', label: 'Conta pré-paga' },
  { id: 'CREDIT_CARD', label: 'Cartão de crédito' },
  { id: 'CASH', label: 'Dinheiro' },
  { id: 'OTHER_ASSET', label: 'Outros ativos' },
];

export const PREPAID_KIND_OPTIONS: { id: PrepaidKind; label: string; hint: string }[] = [
  { id: 'MEAL_VOUCHER', label: 'Vale-Refeição', hint: 'Refeições em restaurantes e similares' },
  { id: 'FOOD_VOUCHER', label: 'Vale-Alimentação', hint: 'Supermercado e alimentação em geral' },
];

const ACCOUNT_TYPE_LABEL = Object.fromEntries(
  ACCOUNT_TYPE_OPTIONS.map((o) => [o.id, o.label]),
) as Record<AccountType, string>;

const PREPAID_KIND_LABEL = Object.fromEntries(
  PREPAID_KIND_OPTIONS.map((o) => [o.id, o.label]),
) as Record<PrepaidKind, string>;

export function accountTypeLabel(type?: AccountType | null): string {
  if (!type) return ACCOUNT_TYPE_LABEL.CHECKING;
  return ACCOUNT_TYPE_LABEL[type] ?? ACCOUNT_TYPE_LABEL.CHECKING;
}

export function prepaidKindLabel(kind?: PrepaidKind | null): string {
  if (!kind) return 'Pré-paga';
  return PREPAID_KIND_LABEL[kind] ?? 'Pré-paga';
}

export function isPrepaidAccount(type?: AccountType | null): boolean {
  return type === 'PREPAID';
}

export function accountTypeIcon(type?: AccountType | null): string {
  if (type === 'CREDIT_CARD') return 'credit_card';
  if (type === 'PREPAID') return 'restaurant';
  if (type === 'CASH') return 'payments';
  if (type === 'OTHER_ASSET') return 'inventory_2';
  return 'savings';
}

export const CONSIDER_BALANCE_OPTIONS: { id: NonNullable<UiAccount['considerBalanceMode']>; label: string }[] = [
  { id: 'IMMEDIATE', label: 'disponível imediatamente' },
  { id: 'PENDING', label: 'aguardando conciliação (MVP)' },
];

export const CREDIT_CARD_CONSIDER_BALANCE_OPTIONS: {
  id: NonNullable<UiAccount['considerBalanceMode']>;
  label: string;
}[] = [
  { id: 'PENDING', label: 'Prever débito na conta principal' },
  { id: 'IMMEDIATE', label: 'Somente no cartão de crédito' },
];

/** Saldo baixo para alerta visual (R$). */
export const PREPAID_LOW_BALANCE_THRESHOLD = 50;

export function prepaidBalanceTone(balance: number | null | undefined): 'ok' | 'low' | 'empty' {
  if (balance == null || !Number.isFinite(balance)) return 'ok';
  if (balance <= 0) return 'empty';
  if (balance <= PREPAID_LOW_BALANCE_THRESHOLD) return 'low';
  return 'ok';
}
