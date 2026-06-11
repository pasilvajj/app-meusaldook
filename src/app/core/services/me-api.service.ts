import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../tokens/api-base-url.token';
import {
  AddressPatchBody,
  ContactPatchBody,
  MeResponse,
  PersonalInfoPatchBody,
} from '../models/me.models';

@Injectable({ providedIn: 'root' })
export class MeApiService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  me(): Observable<MeResponse> {
    return this.http.get<MeResponse>(`${this.base}/api/v1/me`);
  }

  patchPersonal(body: PersonalInfoPatchBody): Observable<MeResponse> {
    return this.http.patch<MeResponse>(`${this.base}/api/v1/me/personal`, body);
  }

  patchAddress(body: AddressPatchBody): Observable<MeResponse> {
    return this.http.patch<MeResponse>(`${this.base}/api/v1/me/address`, body);
  }

  patchContact(body: ContactPatchBody): Observable<MeResponse> {
    return this.http.patch<MeResponse>(`${this.base}/api/v1/me/contact`, body);
  }
}
