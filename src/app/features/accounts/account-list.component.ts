import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DecimalPipe } from '@angular/common';
import { AccountApiService } from '../../core/services/account-api.service';
import { apiErrorMessage } from '../../core/utils/api-error.util';
import { groupsFromAccounts, uiAccountFromApi, writeDtoFromUi } from './account-api.mapper';
import { AccountFormDialogService } from './account-form-dialog.service';
import {
  accountTypeIcon,
  isPrepaidAccount,
  prepaidBalanceTone,
  prepaidKindLabel,
  type UiAccount,
  type UiAccountGroup,
} from './account.models';

@Component({
  selector: 'app-account-list',
  standalone: true,
  imports: [
    DecimalPipe,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatSnackBarModule,
  ],
  templateUrl: './account-list.component.html',
  styleUrl: './account-list.component.scss',
})
export class AccountListComponent implements OnInit {
  private readonly accountApi = inject(AccountApiService);
  private readonly accountDialog = inject(AccountFormDialogService);
  private readonly snack = inject(MatSnackBar);

  readonly groups = signal<UiAccountGroup[]>([]);

  readonly filterText = signal('');
  readonly activeOnly = signal(true);

  readonly accountTypeIcon = accountTypeIcon;
  readonly isPrepaidAccount = isPrepaidAccount;
  readonly prepaidKindLabel = prepaidKindLabel;
  readonly prepaidBalanceTone = prepaidBalanceTone;

  readonly visibleGroups = computed(() => {
    const q = this.filterText().trim().toLowerCase();
    const onlyActive = this.activeOnly();
    return this.groups()
      .map((g) => ({
        ...g,
        accounts: g.accounts.filter((a) => {
          if (onlyActive && !a.active) return false;
          if (q && !a.name.toLowerCase().includes(q)) return false;
          return true;
        }),
      }))
      .filter((g) => g.accounts.length > 0);
  });

  prepaidBalance(acc: UiAccount): number | null {
    if (!isPrepaidAccount(acc.accountType)) return null;
    if (acc.currentBalance != null && Number.isFinite(acc.currentBalance)) {
      return acc.currentBalance;
    }
    return acc.initialBalance ?? 0;
  }

  ngOnInit(): void {
    this.loadAccounts();
  }

  loadAccounts(): void {
    this.accountApi.list().subscribe({
      next: (rows) => {
        const ui = rows.map(uiAccountFromApi);
        this.groups.set(groupsFromAccounts(ui));
      },
      error: () => this.snack.open('Não foi possível carregar as contas.', 'Fechar', { duration: 5000 }),
    });
  }

  onFilterInput(value: string): void {
    this.filterText.set(value);
  }

  onActiveOnlyChange(ev: MatSlideToggleChange): void {
    this.activeOnly.set(ev.checked);
  }

  exportActive(): void {
    const lines = ['Grupo;Nome;Estado'];
    for (const g of this.groups()) {
      for (const a of g.accounts) {
        if (a.active) {
          lines.push(`${this.csvEscape(g.title)};${this.csvEscape(a.name)};${this.csvEscape(a.statusLabel)}`);
        }
      }
    }
    this.downloadBlob('contas-ativas.csv', lines.join('\n'), 'text/csv;charset=utf-8');
  }

  addAccountFab(): void {
    this.accountDialog.openCreate().subscribe((saved) => {
      if (saved) this.loadAccounts();
    });
  }

  openEdit(acc: UiAccount): void {
    this.accountDialog.openEdit({ account: { ...acc } }).subscribe((saved) => {
      if (saved) this.loadAccounts();
    });
  }

  toggleAccountActive(account: UiAccount): void {
    const dto = writeDtoFromUi(account, { active: !account.active });
    this.accountApi.update(account.serverId, dto).subscribe({
      next: () => this.loadAccounts(),
      error: () => this.snack.open('Não foi possível alterar o estado da conta.', 'Fechar', { duration: 5000 }),
    });
  }

  canDeleteAccount(account: UiAccount): boolean {
    return account.publicKey !== 'principal';
  }

  deleteAccount(account: UiAccount): void {
    if (!this.canDeleteAccount(account)) {
      this.snack.open('A conta principal não pode ser excluída.', 'Fechar', { duration: 5000 });
      return;
    }
    const msg =
      `Excluir permanentemente a conta "${account.name}"?\n\n` +
      'Esta ação não pode ser desfeita. Só é possível se a conta não tiver lançamentos ou despesas fixas.';
    if (!confirm(msg)) return;
    this.accountApi.delete(account.serverId).subscribe({
      next: () => {
        this.snack.open('Conta excluída.', 'Fechar', { duration: 4000 });
        this.loadAccounts();
      },
      error: (err) =>
        this.snack.open(apiErrorMessage(err, 'Não foi possível excluir a conta.'), 'Fechar', {
          duration: 7000,
        }),
    });
  }

  private csvEscape(s: string): string {
    if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  private downloadBlob(filename: string, content: string, mime: string): void {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
