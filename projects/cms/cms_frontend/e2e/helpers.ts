import { expect, type Page } from '@playwright/test';

export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'DemoPass-12345';

/** Signs in through the demo "Sign in as" picker, the way a person would. */
export async function signInAs(page: Page, role: string) {
  await page.goto('/login');
  await page.locator('#demo-role').selectOption(role);
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
}

export async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.waitForURL('**/login');
}

export const nav = (page: Page) => page.getByRole('navigation', { name: 'Main navigation' });

/** Collects console errors and failed API calls so a test can assert the page ran clean. */
export function watch(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    // A member with no linked record legitimately gets 403 from /me; everything else is a defect.
    if (r.status() >= 400 && !/\/api\/me\//.test(r.url())) problems.push(`${r.status()} ${r.url()}`);
  });
  return problems;
}
