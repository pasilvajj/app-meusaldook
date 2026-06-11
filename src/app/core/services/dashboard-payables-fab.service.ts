import { Injectable, signal } from '@angular/core';

/**
 * Indica se o dashboard tem despesas futuras («contas a pagar»), para o FAB global
 * abrir o mesmo fluxo que «Incluir despesa» nessa vista.
 */
@Injectable({ providedIn: 'root' })
export class DashboardPayablesFabService {
  readonly hasFuturePayables = signal(false);

  setHasFuturePayables(value: boolean): void {
    this.hasFuturePayables.set(value);
  }
}
