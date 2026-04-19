// E2E tests for the DJ signup form.
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

test.describe('DJ form — page load and structure', () => {
  test('form loads with required elements', async ({ page }) => {
    await page.goto('/dj/');
    await expect(page.locator('#dj-form')).toBeVisible();
    await expect(page.locator('#submit-btn')).toBeVisible();
    await expect(page.locator('.privacy-notice')).toBeVisible();
    await expect(page.locator('#codeOfConductAccepted')).toBeVisible();
  });

  test('has set length field with numeric input', async ({ page }) => {
    await page.goto('/dj/');
    const setLength = page.locator('#setLengthMin');
    await expect(setLength).toBeVisible();
    await expect(setLength).toHaveAttribute('type', 'number');
  });
});

test.describe('DJ form — client-side validation', () => {
  test('blocks submit on empty djName', async ({ page }) => {
    await page.goto('/dj/');
    await page.locator('#submit-btn').click();
    await expect(page.locator('#djName')).toHaveAttribute('aria-invalid', 'true');
  });
});

test.describe('DJ form — golden path (requires live staging)', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'PLAYWRIGHT_BASE_URL not set — skipping live staging tests');

  test('full submission returns a refCode', async ({ page }) => {
    await page.goto('/dj/');
    await waitForFormToken(page);

    await page.fill('#djName', 'E2E Test DJ');
    await page.fill('#email', `e2e-dj-${Date.now()}@example.com`);
    await page.fill('#setStyle', 'blues, neo-soul, fusion');
    await page.fill('#setLengthMin', '60');
    await page.check('#codeOfConductAccepted');
    await injectTurnstileToken(page, '#dj-form');

    await page.locator('#submit-btn').click();

    const statusEl = page.locator('#form-status');
    await expect(statusEl).toContainText('KF-', { timeout: 15000 });
  });
});

test.describe('Rate limit (requires live staging)', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'PLAYWRIGHT_BASE_URL not set — skipping live staging tests');

  test('4th submission from same session is rate-limited', async ({ page }) => {
    const submitOnce = async (n) => {
      await page.goto('/dj/');
      await waitForFormToken(page);
      await page.fill('#djName', `RateLimit DJ ${n}`);
      await page.fill('#email', `ratelimit-${n}-${Date.now()}@example.com`);
      await page.fill('#setStyle', 'test');
      await page.fill('#setLengthMin', '30');
      await page.check('#codeOfConductAccepted');
      await injectTurnstileToken(page, '#dj-form');
      await page.locator('#submit-btn').click();
      await page.waitForSelector('#form-status:not(:empty)', { timeout: 15000 });
      return page.locator('#form-status').textContent();
    };

    await submitOnce(1);
    await submitOnce(2);
    await submitOnce(3);
    const fourthResult = await submitOnce(4);
    expect(fourthResult).toMatch(/rate.?limit|too many/i);
  });
});
