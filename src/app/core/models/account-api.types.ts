/** Valores alinhados ao enum Java `AccountType`. */
export type AccountTypeDto = 'CHECKING' | 'PREPAID' | 'CREDIT_CARD' | 'CASH' | 'OTHER_ASSET';

export type PrepaidKindDto = 'MEAL_VOUCHER' | 'FOOD_VOUCHER';

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
  creditCardDueDay?: number | null;
  creditCardNextInvoiceDate?: string | null;
  creditCardClosingDaysBeforeDue?: number | null;
  prepaidKind?: PrepaidKindDto | null;
  notes: string | null;
  signedInitialBalance: number;
  currentBalance?: number | null;
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
  creditCardDueDay?: number | null;
  creditCardNextInvoiceDate?: string | null;
  creditCardClosingDaysBeforeDue?: number | null;
  prepaidKind?: PrepaidKindDto | null;
  notes?: string | null;
}
