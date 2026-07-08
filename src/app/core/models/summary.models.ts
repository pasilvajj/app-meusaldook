import { MoneyKind } from './money-kind';

export interface MonthlySummaryResponse {
  year: number;
  month: number;
  byKind: { kind: MoneyKind; total: number }[];
  /** Só despesas por categoria. */
  byCategory: { categoryName: string; total: number }[];
  /** Só receitas por categoria (metas de receita). Opcional em respostas antigas da API. */
  byIncomeCategory?: { categoryName: string; total: number }[];
  /** Pagamentos de fatura no caixa (excluídos do gráfico por categoria). */
  invoicePaymentTotal?: number;
}
