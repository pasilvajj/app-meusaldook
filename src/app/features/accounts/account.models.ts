/** Tipo de conta (UI + agrupamento na lista). */
export type AccountType = 'CHECKING' | 'CREDIT_CARD' | 'CASH' | 'OTHER_ASSET';

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
  { id: 'CREDIT_CARD', label: 'Cartão de crédito' },
  { id: 'CASH', label: 'Dinheiro' },
  { id: 'OTHER_ASSET', label: 'Outros ativos' },
];

const ACCOUNT_TYPE_LABEL = Object.fromEntries(
  ACCOUNT_TYPE_OPTIONS.map((o) => [o.id, o.label]),
) as Record<AccountType, string>;

export function accountTypeLabel(type?: AccountType | null): string {
  if (!type) return ACCOUNT_TYPE_LABEL.CHECKING;
  return ACCOUNT_TYPE_LABEL[type] ?? ACCOUNT_TYPE_LABEL.CHECKING;
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
