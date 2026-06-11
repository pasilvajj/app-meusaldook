import { MoneyKind } from './money-kind';

export interface CategoryRequest {
  name: string;
  kind: MoneyKind;
  parentId?: number | null;
}

export interface CategoryResponse {
  id: number;
  name: string;
  kind: MoneyKind;
  parentId: number | null;
  createdAt: string;
}
