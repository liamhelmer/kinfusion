// E2E smoke — requires live staging Worker + Apps Script (T-2.13)
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PREVIEW_URL || 'http://localhost:8788';

test.describe('DJ signup form smoke', () => {
  test('page loads with form visible', async ({ page }) => {
    await page.goto(`${BASE_URL}/dj/`);
    await expect(page.locator('#dj-form')).toBeVisible();
    await expect(page.locator('#submit-btn')).toBeVisible();
  });

  test('client-side validation blocks empty submit', async ({ page }) => {
    await page.goto(`${BASE_URL}/dj/`);
    await page.locator('#submit-btn').click();
    const djNameInput = page.locator('#djName');
    await expect(djNameInput).toHaveAttribute('aria-invalid', 'true');
  });
});
