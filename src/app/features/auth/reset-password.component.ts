import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../core/services/auth.service';
import { apiErrorMessage } from '../../core/utils/api-error.util';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    RouterLink,
  ],
  templateUrl: './reset-password.component.html',
  styleUrl: './login.component.scss',
})
export class ResetPasswordComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly submitting = signal(false);
  readonly token = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
    confirmPassword: ['', [Validators.required]],
  });

  ngOnInit(): void {
    const raw = this.route.snapshot.queryParamMap.get('token');
    if (!raw?.trim()) {
      this.error.set('Link inválido. Solicite um novo e-mail de recuperação.');
      return;
    }
    this.token.set(raw.trim());
  }

  submit(): void {
    this.error.set(null);
    this.success.set(null);
    const tokenValue = this.token();
    if (!tokenValue) {
      this.error.set('Link inválido. Solicite um novo e-mail de recuperação.');
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { password, confirmPassword } = this.form.getRawValue();
    if (password !== confirmPassword) {
      this.error.set('As senhas não coincidem.');
      return;
    }
    this.submitting.set(true);
    this.auth.resetPassword({ token: tokenValue, password }).subscribe({
      next: (res) => {
        this.success.set(res.message);
        this.submitting.set(false);
      },
      error: (err) => {
        this.error.set(
          apiErrorMessage(err, 'Não foi possível redefinir a senha. O link pode ter expirado.'),
        );
        this.submitting.set(false);
      },
    });
  }

  goToLogin(): void {
    void this.router.navigateByUrl('/auth/login');
  }
}
