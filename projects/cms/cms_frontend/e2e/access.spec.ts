import { expect, test } from '@playwright/test';
import { nav, signInAs, watch } from './helpers';

test.describe('role-based access', () => {
  test('the sign-in picker lists the church\'s roles and signs in as the chosen one', async ({ page }) => {
    await page.goto('/login');
    // The list is fetched from the server, so wait for it rather than reading the empty picker.
    await expect(page.locator('#demo-role option', { hasText: 'Administrator' })).toBeAttached();
    const options = await page.locator('#demo-role option').allTextContents();
    expect(options).toEqual(expect.arrayContaining(['Administrator', 'Treasurer', 'Approver', 'Auditor', 'Pastor', 'Secretary', 'Member']));
    await signInAs(page, 'TREASURER');
    await expect(page.getByText('Treasurer', { exact: true }).first()).toBeVisible();
  });

  test('each role sees only the menu its permissions allow', async ({ page }) => {
    await signInAs(page, 'TREASURER');
    await expect(nav(page).getByRole('link', { name: 'Journal' })).toBeVisible();
    await expect(nav(page).getByRole('link', { name: 'Users' })).toHaveCount(0);
    await expect(nav(page).getByRole('link', { name: 'Roles' })).toHaveCount(0);
  });

  test('a member lands on their own account and cannot open church-wide pages', async ({ page }) => {
    await signInAs(page, 'MEMBER');
    await expect(page).toHaveURL(/\/me/);
    await page.goto('/finance');
    await expect(page.getByText('You do not have access to this page')).toBeVisible();
    await page.goto('/roles');
    await expect(page.getByText('You do not have access to this page')).toBeVisible();
  });

  test('an administrator can create a role, give it to a user, and that user is limited by it', async ({ page, browser }) => {
    const problems = watch(page);
    const stamp = Date.now().toString().slice(-6);
    const roleName = `Usher ${stamp}`;
    await signInAs(page, 'ADMIN');
    await nav(page).getByRole('link', { name: 'Roles' }).click();
    await page.getByRole('button', { name: 'New role' }).click();
    await page.getByLabel('Name').fill(roleName);
    await page.locator('.roles-perms label', { hasText: 'members:read' }).locator('input').check();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.roles-name', { hasText: roleName })).toBeVisible();

    await nav(page).getByRole('link', { name: 'Users' }).click();
    await page.getByRole('button', { name: 'New user' }).click();
    const username = `ush${stamp}`;
    await page.getByLabel(/^Username\b/).fill(username);
    await page.getByLabel(/^Email\b/).fill(`${username}@grace-demo.test`);
    await page.getByLabel(/^Password\b/).fill('DemoPass-12345');
    await page.getByLabel(/^Role\b/).selectOption({ label: roleName });
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(`${username}@grace-demo.test`)).toBeVisible();

    const other = await (await browser.newContext()).newPage();
    await other.goto('/login');
    await other.locator('input[type=email]').fill(`${username}@grace-demo.test`);
    await other.locator('input[type=password]').fill('DemoPass-12345');
    await other.locator('button[type=submit]').click();
    await expect(other.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await other.goto('/finance');
    await expect(other.getByText('You do not have access to this page')).toBeVisible();
    expect(problems).toEqual([]);
  });
});
