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

export const CONSIDER_BALANCE_OPTIONS: { id: NonNullable<UiAccount['considerBalanceMode']>; label: string }[] = [
  { id: 'IMMEDIATE', label: 'disponível imediatamente' },
  { id: 'PENDING', label: 'aguardando conciliação (MVP)' },
];
