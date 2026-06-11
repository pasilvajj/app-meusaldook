import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TransactionFormDialogService } from './transaction-form-dialog.service';

/**
 * Rota auxiliar: abre o modal e depois redirecciona (ex. marcador / partilha de URL).
 * Para abrir em cima do dashboard sem trocar de ecrã, use {@link TransactionFormDialogService}.
 */
@Component({
  selector: 'app-transaction-new-bridge',
  standalone: true,
  template: '',
})
export class TransactionNewBridgeComponent implements OnInit {
  private readonly txDialog = inject(TransactionFormDialogService);
  private readonly router = inject(Router);

  ngOnInit(): void {
    this.txDialog.openExpense().subscribe(() => {
      void this.router.navigateByUrl('/transactions');
    });
  }
}
