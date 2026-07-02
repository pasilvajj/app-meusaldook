import { Injectable, inject } from '@angular/core';
import { Overlay } from '@angular/cdk/overlay';
import { MatDialog } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { CategoryExpenseDetailDialogComponent } from './category-expense-detail-dialog.component';
import { CategoryExpenseDetailDialogData } from './category-expense-detail-dialog.models';

const DIALOG_OPTS = {
  width: 'min(96vw, 640px)',
  maxWidth: '96vw',
  autoFocus: 'first-tabbable' as const,
  restoreFocus: true,
  panelClass: 'category-expense-detail-dialog-panel',
  backdropClass: ['define-goals-dialog-backdrop', 'transaction-form-dialog-backdrop'],
};

@Injectable({ providedIn: 'root' })
export class CategoryExpenseDetailDialogService {
  private readonly dialog = inject(MatDialog);
  private readonly overlay = inject(Overlay);

  open(data: CategoryExpenseDetailDialogData): Observable<void> {
    return this.dialog
      .open(CategoryExpenseDetailDialogComponent, {
        ...DIALOG_OPTS,
        data,
        scrollStrategy: this.overlay.scrollStrategies.block(),
      })
      .afterClosed();
  }
}
