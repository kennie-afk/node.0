import { expect, test } from '@playwright/test';
import { nav, signInAs, watch } from './helpers';

const stamp = () => Date.now().toString().slice(-7);

/** Deletes the one row containing `text`: the row's own Delete button, then its inline confirmation. */
async function deleteRow(page: import('@playwright/test').Page, text: string) {
  const row = page.locator('tbody tr', { hasText: text });
  await row.getByRole('button', { name: 'Delete' }).click();
  await row.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('tbody tr', { hasText: text })).toHaveCount(0);
}

test.describe('the shared list screens', () => {
  test('families: create, find by search, edit, delete', async ({ page }) => {
    const problems = watch(page);
    const name = `Omondi ${stamp()}`;
    await signInAs(page, 'ADMIN');
    await nav(page).getByRole('link', { name: 'Families', exact: true }).click();
    await page.getByRole('button', { name: 'New family' }).click();
    await page.getByLabel(/^Family name\b/).fill(name);
    await page.getByLabel(/^City\b/).fill('Kisumu');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await page.getByRole('searchbox').fill(name);
    const row = page.locator('tbody tr', { hasText: name });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Kisumu');

    await row.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel(/^City\b/).fill('Nakuru');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('tbody tr', { hasText: name })).toContainText('Nakuru');

    await deleteRow(page, name);
    expect(problems).toEqual([]);
  });

  test('members: a blank search match says so, and a clearing edit really clears', async ({ page }) => {
    const name = `Tester${stamp()}`;
    await signInAs(page, 'ADMIN');
    await nav(page).getByRole('link', { name: 'Members', exact: true }).click();
    await page.getByRole('button', { name: 'New member' }).click();
    await page.getByLabel(/^First name\b/).fill(name);
    await page.getByLabel(/^Last name\b/).fill('Person');
    await page.getByLabel(/^Email\b/).fill(`${name.toLowerCase()}@example.org`);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('searchbox').fill(name);
    const row = page.locator('tbody tr', { hasText: name });
    await expect(row).toContainText(`${name.toLowerCase()}@example.org`);
    await row.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel(/^Email\b/).fill('');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('tbody tr', { hasText: name })).not.toContainText('@example.org');
    await page.getByRole('searchbox').fill('zzzz-no-such-person');
    await expect(page.getByText(/No members match/)).toBeVisible();
    await page.getByRole('searchbox').fill(name);
    await deleteRow(page, name);
  });

  test('events: an event can be created and appears in the list', async ({ page }) => {
    const name = `Prayer night ${stamp()}`;
    await signInAs(page, 'ADMIN');
    await nav(page).getByRole('link', { name: 'Events', exact: true }).click();
    await page.getByRole('button', { name: 'New event' }).click();
    await page.getByLabel(/^Name\b/).fill(name);
    await page.getByLabel(/Starts|Start/).first().fill('2026-12-05T18:00');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('searchbox').fill(name);
    await expect(page.locator('tbody tr', { hasText: name })).toHaveCount(1);
    await deleteRow(page, name);
  });

  test('a role without write permission sees the list but no create or edit controls', async ({ page }) => {
    await signInAs(page, 'AUDITOR');
    await nav(page).getByRole('link', { name: 'Members', exact: true }).click();
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'New member' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  });
});
