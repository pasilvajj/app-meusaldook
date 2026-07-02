import type { CreditCardInvoiceSummary } from './credit-card-invoice.util';
import type { UiAccount } from './account.models';

export interface CloseInvoiceDialogData {
  account: UiAccount;
  summary: CreditCardInvoiceSummary;
}

export interface CloseInvoiceDialogResult {
  closed: boolean;
}
