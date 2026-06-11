import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../tokens/api-base-url.token';
import { DashboardResponse } from '../models/dashboard.models';

@Injectable({ providedIn: 'root' })
export class DashboardApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  load(year: number, month: number, accountPublicKey = 'principal'): Observable<DashboardResponse> {
    const params = new HttpParams()
      .set('year', String(year))
      .set('month', String(month))
      .set('accountPublicKey', accountPublicKey);
    return this.http.get<DashboardResponse>(`${this.baseUrl}/api/v1/dashboard`, { params });
  }
}
