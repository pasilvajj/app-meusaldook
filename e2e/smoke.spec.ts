import { expect, test } from '@playwright/test';

test('página de login carrega', async ({ page }) => {
  await page.goto('/auth/login');
  await expect(page.getByRole('heading', { name: 'Iniciar sessão' })).toBeVisible();
});
