import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from '../index.js';

// Helper: get a fresh form token
async function getToken() {
  const ctx = createExecutionContext();
  const resp = await worker.fetch(
    new Request('http://localhost/api/form-token', { method: 'POST' }),
    env, ctx
  );
  await waitOnExecutionContext(ctx);
  return (await resp.json()).token;
}

describe('Turnstile verification', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects a missing Turnstile token', async () => {
    const token = await getToken();
    const ctx = createExecutionContext();
    const resp = await worker.fetch(
      new Request('http://localhost/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formToken: token }),
      }),
      env, ctx
    );
    await waitOnExecutionContext(ctx);
    const data = await resp.json();
    expect(data.code).toBe('TURNSTILE_MISSING');
  });

  it('rejects an invalid Turnstile token (mock siteverify failure)', async () => {
    // Mock siteverify to return failure — but ASSETS.fetch also needs to be available
    // Use a targeted mock for the Turnstile URL only
    const originalFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (url, opts) => {
      if (typeof url === 'string' && url.includes('siteverify')) {
        return new Response(JSON.stringify({ success: false }), { status: 200 });
      }
      return originalFetch(url, opts);
    });

    const token = await getToken();
    const ctx = createExecutionContext();
    const resp = await worker.fetch(
      new Request('http://localhost/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formToken: token, 'cf-turnstile-response': 'bad-token' }),
      }),
      env, ctx
    );
    await waitOnExecutionContext(ctx);
    const data = await resp.json();
    expect(data.code).toBe('TURNSTILE_INVALID');
  });
});
