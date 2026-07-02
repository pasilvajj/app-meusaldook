import { Injectable, inject } from '@angular/core';
import { Overlay } from '@angular/cdk/overlay';
import { MatDialog } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { CloseInvoiceDialogComponent } from './close-invoice-dialog.component';
import { CloseInvoiceDialogData, CloseInvoiceDialogResult } from './close-invoice-dialog.models';

const DIALOG_OPTS = {
  width: 'min(96vw, 560px)',
  maxWidth: '96vw',
  autoFocus: 'first-tabbable' as const,
  restoreFocus: true,
  panelClass: 'close-invoice-dialog-panel',
  backdropClass: ['define-goals-dialog-backdrop', 'transaction-form-dialog-backdrop'],
};

@Injectable({ providedIn: 'root' })
export class CloseInvoiceDialogService {
  private readonly dialog = inject(MatDialog);
  private readonly overlay = inject(Overlay);

  open(data: CloseInvoiceDialogData): Observable<CloseInvoiceDialogResult | undefined> {
    return this.dialog
      .open(CloseInvoiceDialogComponent, {
        ...DIALOG_OPTS,
        data,
        scrollStrategy: this.overlay.scrollStrategies.block(),
      })
      .afterClosed();
  }
}
