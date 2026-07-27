import { Page, expect } from '@playwright/test';

/** Log in via the real login form and land on the post-login page. */
export async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByTestId('email').fill(email);
  await page.getByTestId('password').fill(password);
  await page.getByTestId('submit').click();
  await expect(page).toHaveURL(/\/dashboard|\/admin/, { timeout: 15_000 });
}

export const OWNER = { email: 'verify+m7@bulkreach.ug', password: 'TestPass123!' };
export const SUPERADMIN = { email: 'super@bulkreach.ug', password: 'SuperPass123!' };
