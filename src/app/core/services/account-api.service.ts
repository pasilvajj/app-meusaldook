import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../tokens/api-base-url.token';
import { AccountApiResponse, AccountWriteRequestDto } from '../models/account-api.types';

@Injectable({ providedIn: 'root' })
export class AccountApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  list(): Observable<AccountApiResponse[]> {
    return this.http.get<AccountApiResponse[]>(`${this.baseUrl}/api/v1/accounts`);
  }

  getByPublicKey(publicKey: string): Observable<AccountApiResponse> {
    return this.http.get<AccountApiResponse>(`${this.baseUrl}/api/v1/accounts/by-key/${encodeURIComponent(publicKey)}`);
  }

  create(body: AccountWriteRequestDto): Observable<AccountApiResponse> {
    return this.http.post<AccountApiResponse>(`${this.baseUrl}/api/v1/accounts`, body);
  }

  update(id: number, body: AccountWriteRequestDto): Observable<AccountApiResponse> {
    return this.http.patch<AccountApiResponse>(`${this.baseUrl}/api/v1/accounts/${id}`, body);
  }
}
