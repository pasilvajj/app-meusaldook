import { Injectable, inject } from '@angular/core';
import { Overlay } from '@angular/cdk/overlay';
import { MatDialog } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { AccountEditDialogComponent } from './account-edit-dialog.component';
import { AccountFormDialogComponent } from './account-form-dialog.component';
import { AccountEditDialogData } from './account.models';

const DIALOG_OPTS = {
  width: 'min(96vw, 520px)',
  maxWidth: '96vw',
  autoFocus: 'first-tabbable' as const,
  restoreFocus: true,
  panelClass: 'account-form-dialog-panel',
  backdropClass: ['define-goals-dialog-backdrop', 'transaction-form-dialog-backdrop'],
};

@Injectable({ providedIn: 'root' })
export class AccountFormDialogService {
  private readonly dialog = inject(MatDialog);
  private readonly overlay = inject(Overlay);

  openCreate(): Observable<boolean | undefined> {
    return this.dialog
      .open(AccountFormDialogComponent, {
        ...DIALOG_OPTS,
        scrollStrategy: this.overlay.scrollStrategies.block(),
      })
      .afterClosed();
  }

  openEdit(data: AccountEditDialogData): Observable<boolean | undefined> {
    return this.dialog
      .open(AccountEditDialogComponent, {
        ...DIALOG_OPTS,
        data,
        scrollStrategy: this.overlay.scrollStrategies.block(),
      })
      .afterClosed();
  }
}
