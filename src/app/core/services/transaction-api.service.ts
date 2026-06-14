import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../tokens/api-base-url.token';
import { MoneyKind } from '../models/money-kind';
import { Page, TransactionRequest, TransactionResponse } from '../models/transaction.models';

@Injectable({ providedIn: 'root' })
export class TransactionApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  get(id: number): Observable<TransactionResponse> {
    return this.http.get<TransactionResponse>(`${this.baseUrl}/api/v1/transactions/${id}`);
  }

  list(params: {
    page?: number;
    size?: number;
    from?: string;
    to?: string;
    categoryId?: number;
    kind?: MoneyKind;
    accountPublicKey?: string;
    includeProjected?: boolean;
  }): Observable<Page<TransactionResponse>> {
    let httpParams = new HttpParams()
      .set('page', String(params.page ?? 0))
      .set('size', String(params.size ?? 20));
    if (params.from) httpParams = httpParams.set('from', params.from);
    if (params.to) httpParams = httpParams.set('to', params.to);
    if (params.includeProjected) httpParams = httpParams.set('includeProjected', 'true');
    if (params.categoryId != null) httpParams = httpParams.set('categoryId', String(params.categoryId));
    if (params.kind) httpParams = httpParams.set('kind', params.kind);
    if (params.accountPublicKey)
      httpParams = httpParams.set('accountPublicKey', params.accountPublicKey);
    return this.http.get<Page<TransactionResponse>>(`${this.baseUrl}/api/v1/transactions`, {
      params: httpParams,
    });
  }

  create(body: TransactionRequest): Observable<TransactionResponse> {
    return this.http.post<TransactionResponse>(`${this.baseUrl}/api/v1/transactions`, body);
  }

  update(id: number, body: TransactionRequest): Observable<TransactionResponse> {
    return this.http.patch<TransactionResponse>(`${this.baseUrl}/api/v1/transactions/${id}`, body);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/api/v1/transactions/${id}`);
  }

  markPaid(id: number): Observable<TransactionResponse> {
    return this.http.post<TransactionResponse>(`${this.baseUrl}/api/v1/transactions/${id}/mark-paid`, {});
  }

  markOccurrencePaid(body: {
    recurringId?: number;
    legacyTransactionId?: number;
    occurredAt: string;
  }): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/api/v1/transactions/occurrences/mark-paid`, body);
  }
}
