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

test('managed queue: create a brief and advance it (no approval / assignment)', async ({ page }) => {
  await login(page, SUPERADMIN.email, SUPERADMIN.password);
  await page.goto('/admin/managed');
  await expect(page.getByText('Managed queue').first()).toBeVisible();
  // The redesign is a table, not the old kanban.
  await expect(page.locator('table')).toBeVisible();

  // New brief → intake page.
  await page.getByRole('link', { name: /New brief/i }).click();
  await expect(page).toHaveURL(/\/admin\/managed\/new$/);
  await page.locator('#account').selectOption({ index: 1 });
  await page.locator('#brief').fill('E2E managed smoke brief');
  await page.getByRole('button', { name: /Create brief/i }).click();

  // Lands in the focused job workspace at Briefed.
  await expect(page).toHaveURL(/\/admin\/managed\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Briefed').first()).toBeVisible();

  // The simplified flow has no client sign-off and no team assignment.
  await expect(page.getByRole('button', { name: /approval/i })).toHaveCount(0);
  await expect(page.getByText(/assign manager/i)).toHaveCount(0);

  // One clear next action advances the state: Briefed → Drafting.
  await page.getByRole('button', { name: /Start content/i }).click();
  await expect(page.getByRole('button', { name: /Schedule to send/i })).toBeVisible();
});
