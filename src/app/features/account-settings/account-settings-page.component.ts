import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DATE_LOCALE } from '@angular/material/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/services/auth.service';
import { MeApiService } from '../../core/services/me-api.service';
import type { MeResponse } from '../../core/models/me.models';

const LEGACY_EXTRA_STORE_KEY = 'finance_account_profile_extra';

type ActiveNav =
  | 'geral'
  | 'plano'
  | 'assinatura'
  | 'usuarios'
  | 'auditoria'
  | 'notificacoes'
  | 'moeda'
  | 'resetar'
  | 'inativar';

type PlanPeriod = 'ANUAL' | 'SEMESTRAL' | 'TRIMESTRAL';
type PaymentMode = 'PIX' | 'CARTAO' | 'BOLETO';

@Component({
  selector: 'app-account-settings-page',
  standalone: true,
  providers: [{ provide: MAT_DATE_LOCALE, useValue: 'pt-BR' }],
  imports: [
    DecimalPipe,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTabsModule,
    MatIconModule,
    MatDividerModule,
    MatSnackBarModule,
    MatDatepickerModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './account-settings-page.component.html',
  styleUrl: './account-settings-page.component.scss',
})
export class AccountSettingsPageComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly meApi = inject(MeApiService);

  readonly activeNav = signal<ActiveNav>('geral');
  readonly loading = signal(true);
  readonly planExpiresAt = signal(new Date('2026-05-11T00:00:00'));
  readonly selectedPeriod = signal<PlanPeriod>('ANUAL');
  readonly selectedPaymentMode = signal<PaymentMode>('CARTAO');
  readonly selectedInstallment = signal(10);

  readonly userInitials = computed(() => initialsFromDisplayName(this.auth.userDisplayName()));
  readonly planDaysRemaining = computed(() => {
    const end = this.planExpiresAt();
    const today = new Date();
    const now = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const endMs = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
    return Math.max(0, Math.ceil((endMs - now) / (24 * 60 * 60 * 1000)));
  });
  readonly planExpiryLabel = computed(() => {
    const d = this.planExpiresAt();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  });
  readonly planRingPercent = computed(() => {
    const pct = (this.planDaysRemaining() / 30) * 100;
    return Math.max(6, Math.min(100, Math.round(pct)));
  });
  readonly planTotalPrice = computed(() => {
    switch (this.selectedPeriod()) {
      case 'ANUAL':
        return 99.9;
      case 'SEMESTRAL':
        return 77.4;
      default:
        return 50.7;
    }
  });
  readonly planMaxInstallments = computed(() => {
    switch (this.selectedPeriod()) {
      case 'ANUAL':
        return 10;
      case 'SEMESTRAL':
        return 6;
      default:
        return 3;
    }
  });
  readonly installmentOptions = computed(() => {
    const max = this.planMaxInstallments();
    const total = this.planTotalPrice();
    return Array.from({ length: max }, (_, idx) => {
      const count = idx + 1;
      return {
        count,
        amount: total / count,
      };
    });
  });

  readonly infoForm = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.maxLength(255)]],
    sexo: ['' as '' | 'M' | 'F', Validators.required],
    cpf: ['', [Validators.maxLength(14)]],
    birthDate: [null as Date | null],
  });

  readonly addressForm = this.fb.nonNullable.group({
    street: ['', Validators.maxLength(200)],
    number: ['', Validators.maxLength(32)],
    complement: ['', Validators.maxLength(120)],
    postalCode: ['', Validators.maxLength(16)],
    city: ['', Validators.maxLength(120)],
    state: ['', Validators.maxLength(2)],
  });

  readonly contactForm = this.fb.nonNullable.group({
    phone: ['', Validators.maxLength(40)],
  });

  ngOnInit(): void {
    localStorage.removeItem(LEGACY_EXTRA_STORE_KEY);
    this.loadProfile();
  }

  readonly isPlaceholderSection = computed(() => {
    const n = this.activeNav();
    return n === 'usuarios' || n === 'auditoria' || n === 'notificacoes';
  });

  readonly placeholderTitle = computed(() => {
    switch (this.activeNav()) {
      case 'plano':
        return 'Plano e pagamentos';
      case 'assinatura':
        return 'Assinatura do plano';
      case 'usuarios':
        return 'Utilizadores';
      case 'auditoria':
        return 'Trilha de auditoria';
      case 'notificacoes':
        return 'Notificações';
      default:
        return 'Configurações';
    }
  });

  setNav(nav: ActiveNav): void {
    if (nav === 'moeda') {
      this.snack.open('Alteração da moeda padrão ficará disponível em breve.', 'OK', { duration: 3600 });
      return;
    }
    if (nav === 'resetar') {
      if (
        !confirm(
          'Recarregar o perfil a partir do servidor? Alterações não guardadas neste dispositivo serão descartadas.',
        )
      )
        return;
      this.loadProfile();
      this.snack.open('Perfil atualizado a partir do servidor.', 'OK', { duration: 3200 });
      this.activeNav.set('geral');
      return;
    }
    if (nav === 'inativar') {
      this.snack.open('Inativar conta ficará disponível em breve.', 'OK', { duration: 3600 });
      return;
    }
    this.activeNav.set(nav);
  }

  whyCpf(): void {
    this.snack.open(
      'O CPF permite identificação oficial em relatórios fiscais e recibos quando essa funcionalidade estiver ativa.',
      'OK',
      { duration: 6000 },
    );
  }

  saveInformation(): void {
    if (this.infoForm.invalid) {
      this.infoForm.markAllAsTouched();
      return;
    }
    const v = this.infoForm.getRawValue();
    const sexo = v.sexo;
    if (sexo !== 'M' && sexo !== 'F') {
      this.infoForm.markAllAsTouched();
      return;
    }
    const birthIso =
      v.birthDate instanceof Date && !Number.isNaN(v.birthDate.getTime())
        ? v.birthDate.toISOString().slice(0, 10)
        : null;
    const cpfTrim = v.cpf.trim();
    this.meApi
      .patchPersonal({
        fullName: v.fullName.trim(),
        gender: sexo,
        cpf: cpfTrim.length ? cpfTrim : null,
        birthDate: birthIso,
      })
      .subscribe({
        next: (me) => {
          this.auth.hydrateFromMeResponse(me);
          this.applyMeToForms(me);
          this.snack.open('Informações gravadas.', 'OK', { duration: 2600 });
        },
        error: () => this.snack.open('Não foi possível gravar as informações.', 'OK', { duration: 4000 }),
      });
  }

  saveAddress(): void {
    if (this.addressForm.invalid) {
      this.addressForm.markAllAsTouched();
      return;
    }
    const a = this.addressForm.getRawValue();
    this.meApi
      .patchAddress({
        street: a.street.trim() || null,
        number: a.number.trim() || null,
        complement: a.complement.trim() || null,
        postalCode: a.postalCode.trim() || null,
        city: a.city.trim() || null,
        state: a.state.trim() ? a.state.trim().toUpperCase() : null,
      })
      .subscribe({
        next: (me) => {
          this.applyMeToForms(me);
          this.snack.open('Endereço gravado.', 'OK', { duration: 2600 });
        },
        error: () => this.snack.open('Não foi possível gravar o endereço.', 'OK', { duration: 4000 }),
      });
  }

  saveContact(): void {
    if (this.contactForm.invalid) {
      this.contactForm.markAllAsTouched();
      return;
    }
    const phone = this.contactForm.controls.phone.value.trim();
    this.meApi.patchContact({ phone: phone.length ? phone : null }).subscribe({
      next: (me) => {
        this.applyMeToForms(me);
        this.snack.open('Contacto gravado.', 'OK', { duration: 2600 });
      },
      error: () => this.snack.open('Não foi possível gravar o contacto.', 'OK', { duration: 4000 }),
    });
  }

  choosePaymentMode(mode: PaymentMode): void {
    this.selectedPaymentMode.set(mode);
  }

  choosePeriod(period: PlanPeriod): void {
    this.selectedPeriod.set(period);
    const max = period === 'ANUAL' ? 10 : period === 'SEMESTRAL' ? 6 : 3;
    if (this.selectedInstallment() > max) this.selectedInstallment.set(max);
  }

  renewPlan(): void {
    this.activeNav.set('assinatura');
  }

  chooseInstallment(value: number): void {
    this.selectedInstallment.set(value);
  }

  private loadProfile(): void {
    this.loading.set(true);
    this.meApi.me().subscribe({
      next: (me) => {
        this.auth.hydrateFromMeResponse(me);
        this.applyMeToForms(me);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('Não foi possível carregar o perfil.', 'OK', { duration: 5000 });
      },
    });
  }

  private applyMeToForms(me: MeResponse): void {
    let birthD: Date | null = null;
    const raw = me.birthDate;
    if (raw) {
      const s = typeof raw === 'string' ? raw : null;
      if (s) {
        const d = new Date(s.includes('T') ? s : `${s}T12:00:00`);
        if (!Number.isNaN(d.getTime())) birthD = d;
      }
    }
    const g = me.gender;
    const sexo: '' | 'M' | 'F' = g === 'M' || g === 'F' ? g : '';
    this.infoForm.patchValue(
      {
        fullName: me.fullName ?? '',
        sexo,
        cpf: me.cpf ?? '',
        birthDate: birthD,
      },
      { emitEvent: false },
    );
    this.addressForm.patchValue(
      {
        street: me.street ?? '',
        number: me.number ?? '',
        complement: me.complement ?? '',
        postalCode: me.postalCode ?? '',
        city: me.city ?? '',
        state: me.state ?? '',
      },
      { emitEvent: false },
    );
    this.contactForm.patchValue({ phone: me.phone ?? '' }, { emitEvent: false });
  }
}

function initialsFromDisplayName(name: string): string {
  const t = name.trim();
  if (!t) return '?';
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0][0];
    const b = parts[parts.length - 1][0];
    if (a && b) return `${a}${b}`.toUpperCase();
  }
  return t.slice(0, 2).toUpperCase();
}
