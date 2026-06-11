import { Component, DestroyRef, Inject, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CategoryApiService } from '../../core/services/category-api.service';
import { CategoryRequest, CategoryResponse } from '../../core/models/category.models';
import { MoneyKind } from '../../core/models/money-kind';

export interface CategoryFormDialogData {
  categories: CategoryResponse[];
  defaultKind?: MoneyKind;
  /** Edição de categoria existente. */
  edit?: CategoryResponse;
  /** Ao criar subcategoria: pai pré-selecionado. */
  defaultParentId?: number | null;
}

@Component({
  selector: 'app-category-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatSnackBarModule,
  ],
  templateUrl: './category-form-dialog.component.html',
  styleUrl: './category-form-dialog.component.scss',
})
export class CategoryFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly api = inject(CategoryApiService);
  private readonly ref = inject(MatDialogRef<CategoryFormDialogComponent, boolean>);
  private readonly snack = inject(MatSnackBar);

  readonly saving = signal(false);
  readonly editId = signal<number | null>(null);

  private readonly categories = signal<CategoryResponse[]>([]);
  private readonly kindSig = signal<MoneyKind>('EXPENSE');

  readonly form = this.fb.nonNullable.group({
    kind: ['EXPENSE' as MoneyKind, Validators.required],
    name: ['', [Validators.required, Validators.maxLength(100)]],
    parentId: [null as number | null],
  });

  /** Categorias de topo do mesmo tipo (para «Subcategoria de»). */
  readonly parentOptions = computed(() => {
    const k = this.kindSig();
    const eid = this.editId();
    return this.categories()
      .filter((c) => c.kind === k && c.parentId === null && (eid == null || c.id !== eid))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt'));
  });

  constructor(@Inject(MAT_DIALOG_DATA) data: CategoryFormDialogData) {
    this.categories.set(data.categories ?? []);

    if (data.edit) {
      this.editId.set(data.edit.id);
      const dk = data.edit.kind;
      this.kindSig.set(dk);
      this.form.patchValue({
        kind: dk,
        name: data.edit.name,
        parentId: data.edit.parentId,
      });
    } else {
      const dk = data.defaultKind ?? 'EXPENSE';
      this.kindSig.set(dk);
      this.form.patchValue({
        kind: dk,
        parentId: data.defaultParentId ?? null,
      });
    }

    this.form.controls.kind.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((k) => {
      if (k) {
        this.kindSig.set(k);
        const pid = this.form.controls.parentId.value;
        const opts = this.categories().filter((c) => c.kind === k && c.parentId === null);
        if (pid != null && !opts.some((o) => o.id === pid)) {
          this.form.patchValue({ parentId: null });
        }
      }
    });
  }

  readonly dialogTitle = computed(() => (this.editId() != null ? 'Editar categoria' : 'Nova categoria'));

  save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const body: CategoryRequest = {
      name: v.name.trim(),
      kind: v.kind,
      parentId: v.parentId ?? undefined,
    };
    this.saving.set(true);
    const id = this.editId();
    const req$ = id != null ? this.api.update(id, body) : this.api.create(body);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.ref.close(true);
      },
      error: () => {
        this.saving.set(false);
        this.snack.open(id != null ? 'Não foi possível atualizar a categoria.' : 'Não foi possível criar a categoria.', 'OK', {
          duration: 4000,
        });
      },
    });
  }
}
