export interface TransactionFormDialogData {
  /** Layout alinhado ao mock “Nova despesa” (grelha, rodapé com ícones). */
  useExpenseLayout?: boolean;
  /** Quando definido, o modal carrega e grava em modo edição. */
  transactionId?: number;
  /** Tipo inicial ao abrir em modo criação. */
  initialKind?: 'EXPENSE' | 'INCOME';
}
