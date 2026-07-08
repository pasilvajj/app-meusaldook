import type { MonthlySummaryResponse } from '../models/summary.models';

export const INVOICE_PAYMENT_HINT =
  'Saída de caixa ao quitar a fatura do cartão. As compras já aparecem nas categorias acima; incluir aqui evitaria contar duas vezes.';

/** Total de despesas no caixa (inclui pagamento de fatura). */
export function expenseKindTotal(summary: MonthlySummaryResponse): number {
  return Math.abs(summary.byKind.find((k) => k.kind === 'EXPENSE')?.total ?? 0);
}

/** Soma das categorias do gráfico (exclui pagamento de fatura). */
export function categorizedExpenseTotal(summary: MonthlySummaryResponse): number {
  return summary.byCategory.reduce((s, c) => s + Math.abs(Number(c.total) || 0), 0);
}

/** Pagamentos de fatura no mês (campo da API ou diferença calculada). */
export function invoicePaymentExpenseTotal(summary: MonthlySummaryResponse): number {
  const fromApi = summary.invoicePaymentTotal;
  if (fromApi != null && Number.isFinite(fromApi)) {
    return Math.abs(fromApi);
  }
  const gap = expenseKindTotal(summary) - categorizedExpenseTotal(summary);
  return gap > 0.005 ? gap : 0;
}
