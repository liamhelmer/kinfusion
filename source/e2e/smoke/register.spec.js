// E2E smoke — requires live staging Worker + Apps Script (T-2.13)
// Run: PREVIEW_URL=https://... npx playwright test e2e/smoke/register.spec.js
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PREVIEW_URL || 'http://localhost:8788';

test.describe('Registration form smoke', () => {
  test('page loads with form visible', async ({ page }) => {
    await page.goto(`${BASE_URL}/register/`);
    await expect(page.locator('#registration-form')).toBeVisible();
    await expect(page.locator('#submit-btn')).toBeVisible();
  });

  test('client-side validation blocks empty submit', async ({ page }) => {
    await page.goto(`${BASE_URL}/register/`);
    // Attempt submit without filling anything
    await page.locator('#submit-btn').click();
    // Browser native validation should prevent submission (novalidate is on the form,
    // so JS validation fires instead)
    // fullName field should be focused or aria-invalid
    const nameInput = page.locator('#fullName');
    await expect(nameInput).toHaveAttribute('aria-invalid', 'true');
  });

  test('CoC checkbox required to submit', async ({ page }) => {
    await page.goto(`${BASE_URL}/register/`);
    await page.fill('#fullName', 'Smoke Test User');
    await page.fill('#email', 'smoke@example.com');
    await page.locator('input[name=tier][value="350"]').check();
    await page.selectOption('#arrivalDay', 'friday');
    // Do NOT check CoC — expect validation error
    await page.locator('#submit-btn').click();
    const cocInput = page.locator('#codeOfConductAccepted');
    // form-handler sets aria-invalid on the offending field
    await expect(cocInput).toHaveAttribute('aria-invalid', 'true');
  });

  // NOTE: Full happy-path test (submit → refCode → sheet row + email) requires
  // live staging with Turnstile test sitekey. Run manually with the smoke-test-register.sh
  // script after deploying to preview Worker (T-2.9 prerequisite).
});
