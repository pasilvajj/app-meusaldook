import type { AccountApiResponse } from './account-api.types';
import type { BudgetGoalMonthResponse } from './budget-goal.models';
import type { MonthlySummaryResponse } from './summary.models';
import type { TransactionResponse } from './transaction.models';

export interface DashboardResponse {
  summary: MonthlySummaryResponse;
  account: AccountApiResponse;
  goals: BudgetGoalMonthResponse;
  monthTransactions: TransactionResponse[];
  scheduledPayables: TransactionResponse[];
  scheduledReceivables: TransactionResponse[];
}
