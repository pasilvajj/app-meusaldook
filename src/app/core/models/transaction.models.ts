import { MoneyKind } from './money-kind';

export interface TransactionRequest {
  amount: number;
  kind: MoneyKind;
  categoryId: number;
  /** Chave pública da conta; omitido no cliente → api-meusaldook assume `principal`. */
  accountPublicKey?: string | null;
  description?: string | null;
  occurredAt: string;
}

export interface TransactionResponse {
  id: number;
  amount: number;
  kind: MoneyKind;
  categoryId: number;
  categoryName: string;
  accountPublicKey: string;
  accountName: string;
  description: string | null;
  occurredAt: string;
  createdAt: string;
}

export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
}
