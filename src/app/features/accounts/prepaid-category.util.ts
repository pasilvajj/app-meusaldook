import type { PrepaidKind } from './account.models';

/** Categorias padrão compatíveis com Vale-Refeição (nomes normalizados). */
const MEAL_VOUCHER_NAMES = new Set([
  'restaurante',
  'lanchonete',
  'refeicao',
  'padaria',
  'delivery',
  'fast food',
]);

/** Categorias padrão compatíveis com Vale-Alimentação (nomes normalizados). */
const FOOD_VOUCHER_NAMES = new Set([
  'supermercado',
  'alimentacao',
  'gas',
  'feira',
  'hortifruti',
  'mercearia',
  'acougue',
]);

export function normalizeCategoryName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function matchesPrepaidSet(normalized: string, keys: Set<string>): boolean {
  if (keys.has(normalized)) return true;
  for (const key of keys) {
    if (normalized.includes(key) || key.includes(normalized)) return true;
  }
  return false;
}

export function isCategoryAllowedForPrepaid(categoryName: string, prepaidKind: PrepaidKind): boolean {
  const normalized = normalizeCategoryName(categoryName);
  if (prepaidKind === 'MEAL_VOUCHER') {
    return matchesPrepaidSet(normalized, MEAL_VOUCHER_NAMES);
  }
  return matchesPrepaidSet(normalized, FOOD_VOUCHER_NAMES);
}

export function filterCategoriesForPrepaid<T extends { name: string; kind: string }>(
  categories: T[],
  prepaidKind: PrepaidKind | null | undefined,
  moneyKind: string,
): T[] {
  const byKind = categories.filter((c) => c.kind === moneyKind);
  if (!prepaidKind || moneyKind !== 'EXPENSE') return byKind;
  return byKind.filter((c) => isCategoryAllowedForPrepaid(c.name, prepaidKind));
}

export function prepaidCategoryFilterHint(prepaidKind: PrepaidKind): string {
  return prepaidKind === 'MEAL_VOUCHER'
    ? 'Vale-Refeição: categorias como Restaurante.'
    : 'Vale-Alimentação: categorias como Supermercado ou Alimentação.';
}
