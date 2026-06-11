import { MoneyKind } from './money-kind';

export interface BudgetGoalRow {
  categoryId: number;
  categoryName: string;
  currentGoal: number;
  previousMonthGoal: number;
  previousYearSameMonthGoal: number;
}

export interface BudgetGoalMonthResponse {
  year: number;
  month: number;
  kind: MoneyKind;
  rows: BudgetGoalRow[];
}

export interface BulkBudgetGoalLine {
  categoryId: number;
  amount: number;
}

export interface BulkBudgetGoalRequest {
  year: number;
  month: number;
  kind: MoneyKind;
  lines: BulkBudgetGoalLine[];
}
