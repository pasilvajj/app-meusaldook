export interface TransactionFormDialogData {
  /** Layout alinhado ao mock “Nova despesa” (grelha, rodapé com ícones). */
  useExpenseLayout?: boolean;
  /** Quando definido, o modal carrega e grava em modo edição. */
  transactionId?: number;
  /** Despesa fixa (regra recorrente) em modo edição. */
  recurringId?: number;
  /** Tipo inicial ao abrir em modo criação. */
  initialKind?: 'EXPENSE' | 'INCOME';
  /** Conta pré-selecionada (ex.: cartão na tela de fatura). */
  initialAccountKey?: string;
  /** Data do lançamento (yyyy-MM-dd) alinhada ao ciclo de fatura. */
  initialOccurredDate?: string;
  /** Lançamento originado na fatura do cartão: força conta e data no ciclo aberto. */
  creditCardInvoiceContext?: {
    accountKey: string;
    periodStartIso: string;
    periodEndIso: string;
  };
}
