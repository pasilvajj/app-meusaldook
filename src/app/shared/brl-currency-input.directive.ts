import { Directive, ElementRef, HostListener, forwardRef, inject } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Campo texto com máscara de Real (BRL): só dígitos; os dois últimos são centavos (como POS).
 * Valor do formulário: `number` (ex.: 123.45).
 */
@Directive({
  selector: '[appBrlCurrencyInput]',
  standalone: true,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => BrlCurrencyInputDirective),
      multi: true,
    },
  ],
})
export class BrlCurrencyInputDirective implements ControlValueAccessor {
  private readonly host = inject(ElementRef<HTMLInputElement>);

  private onChange: (value: number) => void = () => {};
  private onTouched: () => void = () => {};
  private disabled = false;

  @HostListener('input', ['$event'])
  onInput(ev: Event): void {
    if (this.disabled) return;
    const el = ev.target as HTMLInputElement;
    const digits = el.value.replace(/\D/g, '').slice(0, 15);
    const cents = digits ? parseInt(digits, 10) : 0;
    const value = cents / 100;
    const formatted = brl.format(value);
    if (el.value !== formatted) {
      el.value = formatted;
    }
    this.onChange(value);
  }

  @HostListener('blur')
  onBlur(): void {
    this.onTouched();
  }

  @HostListener('focus', ['$event.target'])
  onFocus(el: HTMLInputElement): void {
    if (this.disabled) return;
    requestAnimationFrame(() => el.select());
  }

  writeValue(value: number | null | undefined): void {
    const n = Number(value);
    const safe = Number.isFinite(n) && n >= 0 ? n : 0;
    this.host.nativeElement.value = brl.format(safe);
  }

  registerOnChange(fn: (value: number) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.host.nativeElement.disabled = isDisabled;
  }
}
