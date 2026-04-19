// E2E tests for the unconference proposal form.
// Requires PLAYWRIGHT_BASE_URL set to staging preview URL for live tests.
import { test, expect } from '@playwright/test';

async function waitForFormToken(page) {
  await page.waitForFunction(() => {
    const input = document.querySelector('input[name="formToken"]');
    return input && input.value && input.value.length > 0;
  }, { timeout: 10000 });
}

async function injectTurnstileToken(page, formSelector) {
  await page.evaluate((sel) => {
    const input = document.querySelector(`${sel} input[name="cf-turnstile-response"]`);
    if (input) {
      input.value = 'XXXX.DUMMY.TOKEN.XXXX';
    } else {
      const el = document.createElement('input');
      el.type = 'hidden';
      el.name = 'cf-turnstile-response';
      el.value = 'XXXX.DUMMY.TOKEN.XXXX';
      document.querySelector(sel).appendChild(el);
    }
  }, formSelector);
}

test.describe('Unconference form — page load and structure', () => {
  test('form loads with required elements', async ({ page }) => {
    await page.goto('/unconference/');
    await expect(page.locator('#unconference-form')).toBeVisible();
    await expect(page.locator('#submit-btn')).toBeVisible();
    await expect(page.locator('.privacy-notice')).toBeVisible();
    await expect(page.locator('#codeOfConductAccepted')).toBeVisible();
  });

  test('duration select has valid options', async ({ page }) => {
    await page.goto('/unconference/');
    const options = await page.locator('#duration option[value]').allTextContents();
    expect(options.join(' ')).toMatch(/30/);
    expect(options.join(' ')).toMatch(/60/);
    expect(options.join(' ')).toMatch(/90/);
  });
});

test.describe('Unconference form — client-side validation', () => {
  test('blocks submit on empty proposerName', async ({ page }) => {
    await page.goto('/unconference/');
    await page.locator('#submit-btn').click();
    await expect(page.locator('#proposerName')).toHaveAttribute('aria-invalid', 'true');
  });
});

test.describe('Unconference form — golden path (requires live staging)', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'PLAYWRIGHT_BASE_URL not set — skipping live staging tests');

  test('full submission returns a refCode', async ({ page }) => {
    await page.goto('/unconference/');
    await waitForFormToken(page);

    await page.fill('#proposerName', 'E2E Proposer');
    await page.fill('#email', `e2e-unc-${Date.now()}@example.com`);
    await page.fill('#workshopTitle', 'Test Workshop Title');
    await page.fill('#description', 'This is an E2E test workshop description for the Playwright test suite.');
    await page.selectOption('#duration', '60');
    await page.check('#codeOfConductAccepted');
    await injectTurnstileToken(page, '#unconference-form');

    await page.locator('#submit-btn').click();

    const statusEl = page.locator('#form-status');
    await expect(statusEl).toContainText('KF-', { timeout: 15000 });
  });
});
