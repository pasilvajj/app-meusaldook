import { Injectable, inject } from '@angular/core';
import { Overlay } from '@angular/cdk/overlay';
import { MatDialog } from '@angular/material/dialog';
import { Observable, Subject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { TransactionFormComponent } from './transaction-form.component';
import { TransactionFormDialogData } from './transaction-form-dialog.data';

/**
 * Abre o formulário de transação como overlay sobre o ecrã actual (sem navegar).
 */
@Injectable({ providedIn: 'root' })
export class TransactionFormDialogService {
  private readonly dialog = inject(MatDialog);
  private readonly overlay = inject(Overlay);

  /** Emite quando uma transação é criada ou actualizada por um modal deste serviço. */
  private readonly committed = new Subject<void>();
  readonly transactionCommitted$ = this.committed.asObservable();

  /** Layout “Nova despesa” (mock, largo); opcionalmente editar por `transactionId`. */
  openExpense(opts?: Partial<TransactionFormDialogData>): Observable<boolean | undefined> {
    return this.open({ useExpenseLayout: true, ...opts });
  }

  /** Formulário compacto (tipo / categoria / valor / data); opcionalmente editar por `transactionId`. */
  openSimple(opts?: Partial<TransactionFormDialogData>): Observable<boolean | undefined> {
    return this.open({ useExpenseLayout: false, ...opts });
  }

  private open(data: TransactionFormDialogData): Observable<boolean | undefined> {
    const expense = data.useExpenseLayout === true;
    return this.dialog
      .open(TransactionFormComponent, {
        width: expense ? 'min(96vw, 520px)' : '560px',
        maxWidth: '96vw',
        autoFocus: 'first-tabbable',
        restoreFocus: true,
        scrollStrategy: this.overlay.scrollStrategies.block(),
        panelClass: expense
          ? ['transaction-form-dialog-panel', 'transaction-form-dialog-panel--wide']
          : 'transaction-form-dialog-panel',
        backdropClass: expense
          ? ['define-goals-dialog-backdrop', 'transaction-form-dialog-backdrop']
          : 'define-goals-dialog-backdrop',
        data,
      })
      .afterClosed()
      .pipe(
        tap((saved) => {
          if (saved) this.committed.next();
        }),
      );
  }
}
