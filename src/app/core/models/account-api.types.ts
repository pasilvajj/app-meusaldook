/** Valores alinhados ao enum Java `AccountType`. */
export type AccountTypeDto = 'CHECKING' | 'CREDIT_CARD' | 'CASH' | 'OTHER_ASSET';

export interface AccountApiResponse {
  id: number;
  publicKey: string;
  name: string;
  active: boolean;
  statusLabel: string;
  accountType: AccountTypeDto;
  currency: string;
  initialBalanceDate: string;
  initialBalanceAmount: number;
  saldoCreditorDebtor: 'CREDITOR' | 'DEBTOR';
  considerBalanceMode: 'IMMEDIATE' | 'PENDING';
  notes: string | null;
  signedInitialBalance: number;
  createdAt: string;
  updatedAt: string;
}

export interface AccountWriteRequestDto {
  publicKey?: string | null;
  name: string;
  accountType: AccountTypeDto;
  currency: string;
  active: boolean;
  initialBalanceDate: string;
  initialBalanceAmount: number;
  saldoCreditorDebtor: 'CREDITOR' | 'DEBTOR';
  considerBalanceMode: 'IMMEDIATE' | 'PENDING';
  notes?: string | null;
}
