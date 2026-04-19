import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from '../index.js';

// Mock Turnstile to always pass for middleware tests
function mockTurnstilePass() {
  const originalFetch = globalThis.fetch;
  vi.stubGlobal('fetch', async (url, opts) => {
    if (typeof url === 'string' && url.includes('siteverify')) {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    return originalFetch(url, opts);
  });
}

function mockTurnstileAndAppsScript(refCode = 'KF-TEST1') {
  const originalFetch = globalThis.fetch;
  vi.stubGlobal('fetch', async (url, opts) => {
    if (typeof url === 'string' && url.includes('siteverify')) {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    if (typeof url === 'string' && url.includes('script.google.com')) {
      return new Response(JSON.stringify({ ok: true, refCode }), { status: 200 });
    }
    return originalFetch(url, opts);
  });
}

async function getToken() {
  const ctx = createExecutionContext();
  const resp = await worker.fetch(
    new Request('http://localhost/api/form-token', { method: 'POST' }),
    env, ctx
  );
  await waitOnExecutionContext(ctx);
  return (await resp.json()).token;
}

const validRegBody = {
  fullName: 'Test User',
  email: 'test@example.com',
  tier: '350',
  arrivalDay: 'friday',
  codeOfConductAccepted: true,
  'cf-turnstile-response': 'test-turnstile-token',
  website: '',
};

describe('Honeypot', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns HTTP 200 generic success when honeypot is filled', async () => {
    mockTurnstilePass();
    const token = await getToken();
    const ctx = createExecutionContext();
    const resp = await worker.fetch(
      new Request('http://localhost/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validRegBody, formToken: token, website: 'http://spam.com' }),
      }),
      env, ctx
    );
    await waitOnExecutionContext(ctx);
    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(data.ok).toBe(true);
    // Should NOT have refCode — just a generic success
    expect(data.refCode).toBeUndefined();
  });
});

describe('Rate limiting', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('blocks the 4th submission from the same IP within 60s', async () => {
    mockTurnstileAndAppsScript();
    const results = [];
    for (let i = 0; i < 4; i++) {
      const token = await getToken();
      const ctx = createExecutionContext();
      const resp = await worker.fetch(
        new Request('http://localhost/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' },
          body: JSON.stringify({ ...validRegBody, formToken: token, email: `test${i}@example.com` }),
        }),
        env, ctx
      );
      await waitOnExecutionContext(ctx);
      results.push(await resp.json());
    }
    const lastResult = results[3];
    expect(lastResult.code).toBe('RATE_LIMITED');
  });
});

describe('Dedupe', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns "already received" for duplicate submission within 10 min', async () => {
    mockTurnstileAndAppsScript();
    // First submission
    const token1 = await getToken();
    const ctx1 = createExecutionContext();
    await worker.fetch(
      new Request('http://localhost/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.0.1' },
        body: JSON.stringify({ ...validRegBody, formToken: token1 }),
      }),
      env, ctx1
    );
    await waitOnExecutionContext(ctx1);

    // Duplicate submission (same email + body)
    const token2 = await getToken();
    const ctx2 = createExecutionContext();
    const resp2 = await worker.fetch(
      new Request('http://localhost/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.0.2' },
        body: JSON.stringify({ ...validRegBody, formToken: token2 }),
      }),
      env, ctx2
    );
    await waitOnExecutionContext(ctx2);
    const data = await resp2.json();
    expect(data.ok).toBe(true);
    expect(data.message).toMatch(/already received/i);
  });
});
