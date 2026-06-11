import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Overlay } from '@angular/cdk/overlay';
import { MatDialog } from '@angular/material/dialog';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CategoryApiService } from '../../core/services/category-api.service';
import { CategoryResponse } from '../../core/models/category.models';
import { MoneyKind } from '../../core/models/money-kind';
import {
  CategoryFormDialogComponent,
  CategoryFormDialogData,
} from './category-form-dialog.component';

@Component({
  selector: 'app-category-list',
  standalone: true,
  imports: [
    MatTableModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatCardModule,
    MatIconModule,
    MatMenuModule,
    MatSnackBarModule,
  ],
  templateUrl: './category-list.component.html',
  styleUrl: './category-list.component.scss',
})
export class CategoryListComponent implements OnInit {
  private readonly api = inject(CategoryApiService);
  private readonly dialog = inject(MatDialog);
  private readonly overlay = inject(Overlay);
  private readonly snack = inject(MatSnackBar);

  readonly displayedColumns = ['name', 'kind', 'actions'] as const;
  readonly rows = signal<CategoryResponse[]>([]);
  readonly loading = signal(true);

  readonly kindFilter = signal<MoneyKind>('EXPENSE');

  readonly displayedRows = computed(() => flattenTreeForKind(this.rows(), this.kindFilter()));

  readonly expenseCount = computed(() => this.rows().filter((r) => r.kind === 'EXPENSE').length);
  readonly incomeCount = computed(() => this.rows().filter((r) => r.kind === 'INCOME').length);

  ngOnInit(): void {
    this.reload();
  }

  setKind(k: MoneyKind): void {
    this.kindFilter.set(k);
  }

  reload(): void {
    this.loading.set(true);
    this.api.list().subscribe({
      next: (list) => {
        this.rows.set(list);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private openCategoryDialog(data: CategoryFormDialogData): void {
    this.dialog
      .open(CategoryFormDialogComponent, {
        width: 'min(96vw, 440px)',
        maxWidth: '96vw',
        hasBackdrop: true,
        autoFocus: 'first-tabbable',
        restoreFocus: true,
        scrollStrategy: this.overlay.scrollStrategies.block(),
        panelClass: 'define-goals-dialog-panel',
        backdropClass: ['cdk-overlay-dark-backdrop', 'define-goals-dialog-backdrop'],
        data,
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) this.reload();
      });
  }

  openCreateModal(): void {
    this.openCategoryDialog({
      categories: this.rows(),
      defaultKind: this.kindFilter(),
    });
  }

  openEditModal(row: CategoryResponse): void {
    this.openCategoryDialog({ categories: this.rows(), edit: row });
  }

  openSubcategoryModal(parent: CategoryResponse): void {
    this.openCategoryDialog({
      categories: this.rows(),
      defaultKind: parent.kind,
      defaultParentId: parent.id,
    });
  }

  inactivateComingSoon(): void {
    this.snack.open('Inativar categoria estará disponível em breve.', 'OK', { duration: 2800 });
  }

  exportComingSoon(): void {
    this.snack.open('Exportação disponível em breve.', 'OK', { duration: 2800 });
  }

  kindLabel(k: MoneyKind): string {
    return k === 'INCOME' ? 'Receita' : 'Despesa';
  }

  remove(row: CategoryResponse): void {
    if (!confirm(`Excluir categoria "${row.name}"?`)) return;
    this.api.delete(row.id).subscribe({
      next: () => this.reload(),
      error: () => alert('Não foi possível excluir (pode ter transações associadas).'),
    });
  }
}

function flattenTreeForKind(
  rows: CategoryResponse[],
  kind: MoneyKind,
): { row: CategoryResponse; depth: number }[] {
  const byKind = rows.filter((r) => r.kind === kind);
  const childrenOf = (parentId: number | null) =>
    byKind
      .filter((c) => (c.parentId ?? null) === parentId)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt'));

  const out: { row: CategoryResponse; depth: number }[] = [];
  const walk = (parentId: number | null, depth: number) => {
    for (const child of childrenOf(parentId)) {
      out.push({ row: child, depth });
      walk(child.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
