import type { AccountApiResponse, AccountTypeDto, AccountWriteRequestDto } from '../../core/models/account-api.types';
import { ACCOUNT_TYPE_OPTIONS, AccountType, UiAccount, UiAccountGroup } from './account.models';

export function uiAccountFromApi(r: AccountApiResponse): UiAccount {
  const accountType = r.accountType as AccountType;
  const ibd =
    typeof r.initialBalanceDate === 'string'
      ? r.initialBalanceDate.slice(0, 10)
      : String(r.initialBalanceDate).slice(0, 10);
  return {
    serverId: Number(r.id),
    publicKey: r.publicKey,
    name: r.name,
    active: r.active,
    statusLabel: r.statusLabel,
    currency: r.currency,
    accountType,
    initialBalance: Number(r.signedInitialBalance),
    initialBalanceAmount: Number(r.initialBalanceAmount),
    initialBalanceDate: ibd,
    saldoCreditorDebtor: r.saldoCreditorDebtor,
    considerBalanceMode: r.considerBalanceMode,
    notes: r.notes ?? undefined,
  };
}

export function groupsFromAccounts(accounts: UiAccount[]): UiAccountGroup[] {
  const map = new Map<AccountType, UiAccount[]>();
  for (const opt of ACCOUNT_TYPE_OPTIONS) {
    map.set(opt.id, []);
  }
  for (const a of accounts) {
    const t = (a.accountType ?? 'CHECKING') as AccountType;
    const bucket = map.get(t);
    if (bucket) bucket.push(a);
    else map.get('CHECKING')!.push(a);
  }
  return [
    { id: 'checking', title: 'Conta corrente', accounts: map.get('CHECKING')! },
    { id: 'credit', title: 'Cartão de crédito', accounts: map.get('CREDIT_CARD')! },
    { id: 'cash', title: 'Dinheiro', accounts: map.get('CASH')! },
    { id: 'other', title: 'Outros ativos', accounts: map.get('OTHER_ASSET')! },
  ];
}

export function writeDtoForCreate(params: {
  accountType: AccountType;
  currency: string;
  name: string;
  initialBalanceAmount: number;
  saldoCreditorDebtor: 'CREDITOR' | 'DEBTOR';
  considerBalanceMode: 'IMMEDIATE' | 'PENDING';
  initialBalanceDate: string;
  notes?: string | null;
  publicKey?: string | null;
}): AccountWriteRequestDto {
  return {
    publicKey: params.publicKey,
    name: params.name,
    accountType: params.accountType as AccountTypeDto,
    currency: params.currency.toUpperCase(),
    active: true,
    initialBalanceDate: params.initialBalanceDate,
    initialBalanceAmount: params.initialBalanceAmount,
    saldoCreditorDebtor: params.saldoCreditorDebtor,
    considerBalanceMode: params.considerBalanceMode,
    notes: params.notes ?? null,
  };
}

export function writeDtoFromUi(
  a: UiAccount,
  overrides?: Partial<AccountWriteRequestDto>,
): AccountWriteRequestDto {
  const amt = a.initialBalanceAmount ?? 0;
  return {
    publicKey: a.publicKey,
    name: a.name,
    accountType: (a.accountType ?? 'CHECKING') as AccountTypeDto,
    currency: (a.currency ?? 'BRL').toUpperCase(),
    active: a.active,
    initialBalanceDate: (a.initialBalanceDate ?? new Date().toISOString().slice(0, 10)),
    initialBalanceAmount: typeof amt === 'number' ? amt : Number(amt),
    saldoCreditorDebtor: a.saldoCreditorDebtor ?? 'CREDITOR',
    considerBalanceMode: a.considerBalanceMode ?? 'IMMEDIATE',
    notes: a.notes ?? null,
    ...overrides,
  };
}
