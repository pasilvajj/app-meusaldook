import type { UiAccount } from './account.models';
import type { FutureInvoiceGroup } from './credit-card-invoice.util';

export interface FutureInstallmentsDialogData {
  account: UiAccount;
  groups: FutureInvoiceGroup[];
}

export interface AnticipateInstallmentsDialogData {
  account: UiAccount;
  groups: FutureInvoiceGroup[];
  /** Dia (ISO) em que as parcelas antecipadas entram na fatura aberta. */
  anticipateToIso: string;
}

export interface AnticipateInstallmentsDialogResult {
  anticipated: boolean;
}
