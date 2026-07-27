import { test, expect } from '@playwright/test';
import { login, OWNER } from './helpers';

test('client can complete a simulated mobile-money checkout', async ({ page }) => {
  await login(page, OWNER.email, OWNER.password);

  await page.goto('/dashboard/billing');
  await expect(page.getByRole('heading', { name: 'Billing', level: 2 })).toBeVisible();

  // Pick the first non-current plan.
  const choose = page.getByRole('button', { name: 'Choose plan' }).first();
  await expect(choose).toBeVisible();
  await choose.click();

  await expect(page).toHaveURL(/\/dashboard\/billing\/checkout\?plan=/);
  await expect(page.getByRole('heading', { name: 'Complete your purchase' })).toBeVisible();

  // MTN MoMo is selected by default; provide a Mobile Money number and pay.
  await page.getByLabel('Mobile Money number').fill('+256770000000');
  await page.getByRole('button', { name: /^Pay UGX/ }).click();

  // Simulated mode → processing → success (poller confirms).
  await expect(page.getByText("You're all set!")).toBeVisible({ timeout: 40_000 });
});
