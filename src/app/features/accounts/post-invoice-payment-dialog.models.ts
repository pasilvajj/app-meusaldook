import type { TransactionResponse } from '../../core/models/transaction.models';
import type { CreditCardInvoiceSummary } from './credit-card-invoice.util';
import type { UiAccount } from './account.models';

export interface PostInvoicePaymentDialogData {
  account: UiAccount;
  summary: CreditCardInvoiceSummary;
  scheduledPayment?: TransactionResponse;
}

export interface PostInvoicePaymentDialogResult {
  paid: boolean;
}
