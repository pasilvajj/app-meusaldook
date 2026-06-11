import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { API_BASE_URL } from '../tokens/api-base-url.token';
import { AuthResponse, LoginRequest, RegisterRequest } from '../models/auth.models';
import type { MeResponse } from '../models/me.models';

const TOKEN_KEY = 'finance_access_token';
const USER_EMAIL_KEY = 'finance_user_email';
const USER_DISPLAY_NAME_KEY = 'finance_user_display_name';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly router = inject(Router);

  private readonly tokenSignal = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  private readonly userEmailSignal = signal<string | null>(localStorage.getItem(USER_EMAIL_KEY));
  private readonly userDisplayNameSignal = signal<string | null>(localStorage.getItem(USER_DISPLAY_NAME_KEY));

  constructor() {
    this.hydrateProfileFromJwtIfNeeded();
  }

  readonly token = this.tokenSignal.asReadonly();
  readonly isAuthenticated = computed(() => !!this.tokenSignal());
  /** Email guardado após login ou registo (para o menu de utilizador). */
  readonly userEmail = this.userEmailSignal.asReadonly();
  /** Nome a mostrar; no login inferido a partir do email se não existir nome guardado. */
  readonly userDisplayName = computed(() => {
    const name = this.userDisplayNameSignal()?.trim();
    if (name) return name;
    const email = this.userEmailSignal();
    if (email) {
      const local = email.split('@')[0];
      return local || email;
    }
    return 'Utilizador';
  });

  login(body: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/api/v1/auth/login`, body).pipe(
      tap((res) => this.persistToken(res.accessToken)),
    );
  }

  register(body: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/api/v1/auth/register`, body).pipe(
      tap((res) => this.persistToken(res.accessToken)),
    );
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_EMAIL_KEY);
    localStorage.removeItem(USER_DISPLAY_NAME_KEY);
    this.tokenSignal.set(null);
    this.userEmailSignal.set(null);
    this.userDisplayNameSignal.set(null);
    void this.router.navigateByUrl('/auth/login');
  }

  /** Atualiza o nome na sessão (ex.: após gravar dados pessoais). */
  updateDisplayName(displayName: string): void {
    const trimmed = displayName.trim();
    if (!trimmed) return;
    localStorage.setItem(USER_DISPLAY_NAME_KEY, trimmed);
    this.userDisplayNameSignal.set(trimmed);
  }

  /** Alinha email e nome com o perfil guardado na API (`GET /api/v1/me`). */
  hydrateFromMeResponse(me: MeResponse): void {
    localStorage.setItem(USER_EMAIL_KEY, me.email);
    this.userEmailSignal.set(me.email);
    const name = me.fullName?.trim() ?? '';
    if (name) {
      localStorage.setItem(USER_DISPLAY_NAME_KEY, name);
      this.userDisplayNameSignal.set(name);
    } else {
      localStorage.removeItem(USER_DISPLAY_NAME_KEY);
      this.userDisplayNameSignal.set(null);
    }
  }

  private persistToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
    this.tokenSignal.set(token);
  }

  private persistProfile(email: string, displayName: string): void {
    localStorage.setItem(USER_EMAIL_KEY, email);
    localStorage.setItem(USER_DISPLAY_NAME_KEY, displayName);
    this.userEmailSignal.set(email);
    this.userDisplayNameSignal.set(displayName);
  }

  /** Sessões só com token (antes deste perfil): tenta extrair email do JWT se existir claim. */
  private hydrateProfileFromJwtIfNeeded(): void {
    if (localStorage.getItem(USER_EMAIL_KEY)) return;
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    const payload = decodeJwtPayload(token);
    const emailRaw = payload?.['email'];
    const subRaw = payload?.['sub'];
    const email =
      typeof emailRaw === 'string'
        ? emailRaw
        : typeof subRaw === 'string' && subRaw.includes('@')
          ? subRaw
          : null;
    if (!email) return;
    const inferred = email.split('@')[0] || email;
    this.persistProfile(email, inferred);
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4;
    if (pad) base64 += '='.repeat(4 - pad);
    const json = atob(base64);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}
