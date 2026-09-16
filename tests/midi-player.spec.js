const { test, expect } = require('@playwright/test');

test('home page loads and exposes the MIDI player controls', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/Singcat MIDI Player/i);
  await expect(page.getByRole('heading', { name: /Singcat MIDI Player/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Play yang dipilih/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Stop semua/i })).toBeVisible();
  await expect(page.getByText(/Belum ada MIDI dimuat|Pinkfong/i).first()).toBeVisible();
});

