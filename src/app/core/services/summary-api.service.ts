import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../tokens/api-base-url.token';
import { MonthlySummaryResponse } from '../models/summary.models';

@Injectable({ providedIn: 'root' })
export class SummaryApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  monthly(year: number, month: number, accountPublicKey?: string): Observable<MonthlySummaryResponse> {
    let params = new HttpParams().set('year', String(year)).set('month', String(month));
    if (accountPublicKey) params = params.set('accountPublicKey', accountPublicKey);
    return this.http.get<MonthlySummaryResponse>(`${this.baseUrl}/api/v1/reports/monthly`, { params });
  }
}
