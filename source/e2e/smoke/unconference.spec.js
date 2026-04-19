// E2E smoke — requires live staging Worker + Apps Script (T-2.13)
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PREVIEW_URL || 'http://localhost:8788';

test.describe('Unconference proposal form smoke', () => {
  test('page loads with form visible', async ({ page }) => {
    await page.goto(`${BASE_URL}/unconference/`);
    await expect(page.locator('#unconference-form')).toBeVisible();
    await expect(page.locator('#submit-btn')).toBeVisible();
  });

  test('client-side validation blocks empty submit', async ({ page }) => {
    await page.goto(`${BASE_URL}/unconference/`);
    await page.locator('#submit-btn').click();
    const nameInput = page.locator('#proposerName');
    await expect(nameInput).toHaveAttribute('aria-invalid', 'true');
  });
});
