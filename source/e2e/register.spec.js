// E2E tests for the registration form.
// Requires a live staging Worker + Apps Script with Turnstile test sitekey 1x00000000000000000000AA.
// Set PLAYWRIGHT_BASE_URL env var to the staging preview URL before running.
import { test, expect } from '@playwright/test';

// Helper: wait for form-token to be fetched (injected into form as hidden input)
async function waitForFormToken(page) {
  await page.waitForFunction(() => {
    const input = document.querySelector('input[name="formToken"]');
    return input && input.value && input.value.length > 0;
  }, { timeout: 10000 });
}

// Helper: inject a Turnstile test token (the test sitekey auto-generates a token)
async function injectTurnstileToken(page) {
  await page.waitForFunction(() => {
    return typeof window.turnstileCallback === 'function';
  }, { timeout: 10000 }).catch(() => {
    // Turnstile may not be available in local-only tests — inject manually
  });
  await page.evaluate(() => {
    const input = document.querySelector('input[name="cf-turnstile-response"]');
    if (input) {
      input.value = 'XXXX.DUMMY.TOKEN.XXXX';
    } else {
      // create the hidden input form-handler expects
      const el = document.createElement('input');
      el.type = 'hidden';
      el.name = 'cf-turnstile-response';
      el.value = 'XXXX.DUMMY.TOKEN.XXXX';
      document.querySelector('#registration-form').appendChild(el);
    }
  });
}

test.describe('Registration form — page load and structure', () => {
  test('form loads with required elements', async ({ page }) => {
    await page.goto('/register/');
    await expect(page.locator('#registration-form')).toBeVisible();
    await expect(page.locator('#submit-btn')).toBeVisible();
    await expect(page.locator('.privacy-notice')).toBeVisible();
    await expect(page.locator('#codeOfConductAccepted')).toBeVisible();
    await expect(page.locator('#photoConsent')).toBeVisible();
  });

  test('privacy notice mentions December 12 2026 deletion date', async ({ page }) => {
    await page.goto('/register/');
    const privacyText = await page.locator('.privacy-notice').textContent();
    expect(privacyText).toContain('December');
    expect(privacyText).toContain('2026');
  });

  test('has aria-live alert region for status announcements', async ({ page }) => {
    await page.goto('/register/');
    await expect(page.locator('#form-status[aria-live="polite"]')).toBeAttached();
  });
});

test.describe('Registration form — client-side validation', () => {
  test('blocks submit on empty fullName', async ({ page }) => {
    await page.goto('/register/');
    await page.locator('#submit-btn').click();
    await expect(page.locator('#fullName')).toHaveAttribute('aria-invalid', 'true');
  });

  test('blocks submit when CoC not accepted', async ({ page }) => {
    await page.goto('/register/');
    await page.fill('#fullName', 'Test User');
    await page.fill('#email', 'test@example.com');
    await page.locator('input[name="tier"][value="350"]').check();
    await page.selectOption('#arrivalDay', 'friday');
    await page.locator('#submit-btn').click();
    await expect(page.locator('#codeOfConductAccepted')).toHaveAttribute('aria-invalid', 'true');
  });

  test('submit button is present and enabled on page load', async ({ page }) => {
    await page.goto('/register/');
    const btn = page.locator('#submit-btn');
    await expect(btn).toBeEnabled();
  });
});

test.describe('Registration form — golden path (requires live staging)', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'PLAYWRIGHT_BASE_URL not set — skipping live staging tests');

  test('full submission returns a refCode', async ({ page }) => {
    await page.goto('/register/');
    await waitForFormToken(page);

    await page.fill('#fullName', 'E2E Test User');
    await page.fill('#email', `e2e-${Date.now()}@example.com`);
    await page.fill('#pronouns', 'they/them');
    await page.locator('input[name="tier"][value="350"]').check();
    await page.selectOption('#arrivalDay', 'friday');
    await page.check('#codeOfConductAccepted');
    await injectTurnstileToken(page);

    await page.locator('#submit-btn').click();

    // Success: refCode displayed matching KF-XXXXX
    const statusEl = page.locator('#form-status');
    await expect(statusEl).toContainText('KF-', { timeout: 15000 });
  });
});

test.describe('Registration form — duplicate submission', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'PLAYWRIGHT_BASE_URL not set — skipping live staging tests');

  test('duplicate submit shows already-received message', async ({ page }) => {
    const uniqueEmail = `dup-${Date.now()}@example.com`;

    // First submission
    await page.goto('/register/');
    await waitForFormToken(page);
    await page.fill('#fullName', 'Dupe Test');
    await page.fill('#email', uniqueEmail);
    await page.locator('input[name="tier"][value="300"]').check();
    await page.selectOption('#arrivalDay', 'saturday');
    await page.check('#codeOfConductAccepted');
    await injectTurnstileToken(page);
    await page.locator('#submit-btn').click();
    await expect(page.locator('#form-status')).toContainText('KF-', { timeout: 15000 });

    // Second submission with same email — form re-fills using a new page load
    await page.goto('/register/');
    await waitForFormToken(page);
    await page.fill('#fullName', 'Dupe Test');
    await page.fill('#email', uniqueEmail);
    await page.locator('input[name="tier"][value="300"]').check();
    await page.selectOption('#arrivalDay', 'saturday');
    await page.check('#codeOfConductAccepted');
    await injectTurnstileToken(page);
    await page.locator('#submit-btn').click();
    const statusEl = page.locator('#form-status');
    await expect(statusEl).toContainText(/already received|duplicate/i, { timeout: 15000 });
  });
});
