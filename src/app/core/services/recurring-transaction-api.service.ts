import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../tokens/api-base-url.token';
import { MoneyKind } from '../models/money-kind';
import type { InstallmentPeriodicity } from '../../features/transactions/repetition-customize-dialog.data';

export interface RecurringTransactionRequest {
  amount: number;
  kind: MoneyKind;
  categoryId: number;
  accountPublicKey?: string | null;
  description?: string | null;
  startAt: string;
  periodicity: InstallmentPeriodicity;
  everyN: number;
  maxOccurrences?: number | null;
  showInPayables?: boolean;
}

export interface RecurringTransactionResponse {
  id: number;
  amount: number;
  kind: MoneyKind;
  categoryId: number;
  categoryName: string;
  accountPublicKey: string;
  accountName: string;
  description: string | null;
  startAt: string;
  periodicity: InstallmentPeriodicity;
  everyN: number;
  maxOccurrences: number | null;
  active: boolean;
  createdAt: string;
  showInPayables: boolean;
}

@Injectable({ providedIn: 'root' })
export class RecurringTransactionApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  get(id: number): Observable<RecurringTransactionResponse> {
    return this.http.get<RecurringTransactionResponse>(`${this.baseUrl}/api/v1/recurring-transactions/${id}`);
  }

  create(body: RecurringTransactionRequest): Observable<RecurringTransactionResponse> {
    return this.http.post<RecurringTransactionResponse>(`${this.baseUrl}/api/v1/recurring-transactions`, body);
  }

  update(id: number, body: RecurringTransactionRequest): Observable<RecurringTransactionResponse> {
    return this.http.patch<RecurringTransactionResponse>(
      `${this.baseUrl}/api/v1/recurring-transactions/${id}`,
      body,
    );
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/api/v1/recurring-transactions/${id}`);
  }
}
