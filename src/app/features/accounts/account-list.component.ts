import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AccountApiService } from '../../core/services/account-api.service';
import { groupsFromAccounts, uiAccountFromApi, writeDtoFromUi } from './account-api.mapper';
import { AccountFormDialogService } from './account-form-dialog.service';
import type { UiAccount, UiAccountGroup } from './account.models';

@Component({
  selector: 'app-account-list',
  standalone: true,
  imports: [
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
