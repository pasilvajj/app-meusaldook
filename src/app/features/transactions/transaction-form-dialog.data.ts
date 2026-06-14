export interface TransactionFormDialogData {
  /** Layout alinhado ao mock “Nova despesa” (grelha, rodapé com ícones). */
  useExpenseLayout?: boolean;
  /** Quando definido, o modal carrega e grava em modo edição. */
  transactionId?: number;
  /** Despesa fixa (regra recorrente) em modo edição. */
  recurringId?: number;
  /** Tipo inicial ao abrir em modo criação. */
  initialKind?: 'EXPENSE' | 'INCOME';
}
