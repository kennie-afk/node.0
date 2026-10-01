import { expect, test } from '@playwright/test';
import { nav, signInAs, watch } from './helpers';

test.describe('dashboard', () => {
  test('an administrator sees the figures, attention items and quick actions', async ({ page }) => {
    const problems = watch(page);
    await signInAs(page, 'ADMIN');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText('Giving this month')).toBeVisible();
    await expect(page.getByText('Needs attention')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Record a gift' })).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('a secretary gets people panels but no money', async ({ page }) => {
    await signInAs(page, 'SECRETARY');
    await expect(page.getByText('New members')).toBeVisible();
    await expect(page.getByText('Giving this month')).toHaveCount(0);
    await expect(page.getByText('Cash and bank')).toHaveCount(0);
  });
});

test.describe('documents', () => {
  test('a gift receipt downloads as a PDF', async ({ page }) => {
    await signInAs(page, 'TREASURER');
    await nav(page).getByRole('link', { name: 'Gifts', exact: true }).click();
    await page.locator('tbody tr', { hasText: 'RCT-' }).first().click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download PDF' }).click();
    expect((await download).suggestedFilename()).toMatch(/^RCT-\d+\.pdf$/);
  });
});

test.describe('theme', () => {
  test('the light/dark choice is remembered across a reload', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light');
    await page.getByRole('button', { name: /Switch to light mode/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByRole('button', { name: /Switch to dark mode/ }).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light');
  });
});
