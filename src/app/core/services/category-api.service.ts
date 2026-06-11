import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../tokens/api-base-url.token';
import { CategoryRequest, CategoryResponse } from '../models/category.models';

@Injectable({ providedIn: 'root' })
export class CategoryApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  list(): Observable<CategoryResponse[]> {
    return this.http.get<CategoryResponse[]>(`${this.baseUrl}/api/v1/categories`);
  }

  create(body: CategoryRequest): Observable<CategoryResponse> {
    return this.http.post<CategoryResponse>(`${this.baseUrl}/api/v1/categories`, body);
  }

  update(id: number, body: CategoryRequest): Observable<CategoryResponse> {
    return this.http.patch<CategoryResponse>(`${this.baseUrl}/api/v1/categories/${id}`, body);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/api/v1/categories/${id}`);
  }
}
