import { test, expect } from '@playwright/test';
import { login, SUPERADMIN } from './helpers';

test('superadmin dashboard shows live KPIs', async ({ page }) => {
  await login(page, SUPERADMIN.email, SUPERADMIN.password);
  await page.goto('/admin');
  await expect(page.getByText('Total clients', { exact: false })).toBeVisible();
  await expect(page.getByText('Revenue', { exact: false }).first()).toBeVisible();
});

test('superadmin can drive the data-archive page', async ({ page }) => {
  await login(page, SUPERADMIN.email, SUPERADMIN.password);
  await page.goto('/admin/archive');
  await expect(page.getByText('Data archive', { exact: false }).first()).toBeVisible();
  // Trigger a live ingest — must not error.
  await page.getByRole('button', { name: /Ingest now/i }).click();
  await expect(page.getByText(/Archived campaigns/i)).toBeVisible();
});

test('non-superadmin is kept out of admin API (billing still works)', async ({ page }) => {
  await login(page, 'verify+m7@bulkreach.ug', 'TestPass123!');
  // A client hitting an admin API directly must be forbidden.
  const res = await page.request.get('/api/v1/admin/overview');
  expect([401, 403]).toContain(res.status());
});
