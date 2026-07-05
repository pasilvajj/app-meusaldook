import { Injectable, inject } from '@angular/core';
import { Overlay } from '@angular/cdk/overlay';
import { MatDialog } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { FutureInstallmentsDialogComponent } from './future-installments-dialog.component';
import { AnticipateInstallmentsDialogComponent } from './anticipate-installments-dialog.component';
import {
  AnticipateInstallmentsDialogData,
  AnticipateInstallmentsDialogResult,
  FutureInstallmentsDialogData,
} from './future-installments-dialog.models';

const DIALOG_OPTS = {
  width: 'min(96vw, 640px)',
  maxWidth: '96vw',
  autoFocus: 'first-tabbable' as const,
  restoreFocus: true,
  panelClass: 'close-invoice-dialog-panel',
  backdropClass: ['define-goals-dialog-backdrop', 'transaction-form-dialog-backdrop'],
};

@Injectable({ providedIn: 'root' })
export class FutureInstallmentsDialogService {
  private readonly dialog = inject(MatDialog);
  private readonly overlay = inject(Overlay);

  openFuture(data: FutureInstallmentsDialogData): Observable<void> {
    return this.dialog
      .open(FutureInstallmentsDialogComponent, {
        ...DIALOG_OPTS,
        data,
        scrollStrategy: this.overlay.scrollStrategies.block(),
      })
      .afterClosed();
  }

  openAnticipate(
    data: AnticipateInstallmentsDialogData,
  ): Observable<AnticipateInstallmentsDialogResult | undefined> {
    return this.dialog
      .open(AnticipateInstallmentsDialogComponent, {
        ...DIALOG_OPTS,
        data,
        scrollStrategy: this.overlay.scrollStrategies.block(),
      })
      .afterClosed();
  }
}
