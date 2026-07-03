export interface OpenInvoiceScope {
  accountPublicKey: string;
  periodStartIso: string;
  periodEndIso: string;
}

export interface CategoryExpenseDetailDialogData {
  categoryName: string;
  sharePct: string;
  categoryTotal: number;
  year: number;
  month: number;
  /** Quando informado, cartões entram só pelo período da fatura aberta (não pelo mês civil). */
  openInvoiceScopes?: OpenInvoiceScope[];
}
