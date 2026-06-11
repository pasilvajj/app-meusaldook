import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../tokens/api-base-url.token';
import { MoneyKind } from '../models/money-kind';
import { BudgetGoalMonthResponse, BulkBudgetGoalRequest } from '../models/budget-goal.models';

@Injectable({ providedIn: 'root' })
export class BudgetGoalApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  getMonth(year: number, month: number, kind: MoneyKind): Observable<BudgetGoalMonthResponse> {
    const params = new HttpParams()
      .set('year', String(year))
      .set('month', String(month))
      .set('kind', kind);
    return this.http.get<BudgetGoalMonthResponse>(`${this.baseUrl}/api/v1/budget-goals`, { params });
  }

  saveBulk(body: BulkBudgetGoalRequest): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/api/v1/budget-goals`, body, {
      observe: 'response',
    }).pipe(map(() => undefined));
  }
}
