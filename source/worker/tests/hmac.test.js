import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import worker from '../index.js';

function mockAppsScript(response) {
  const originalFetch = globalThis.fetch;
  vi.stubGlobal('fetch', async (url, opts) => {
    if (typeof url === 'string' && url.includes('siteverify')) {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    if (typeof url === 'string' && url.includes('script.google.com')) {
      const body = opts?.body ? JSON.parse(opts.body) : {};
      return new Response(JSON.stringify(response(body)), { status: 200 });
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
  fullName: 'HMAC Test',
  email: 'hmac@example.com',
  tier: '350',
  arrivalDay: 'friday',
  codeOfConductAccepted: true,
  'cf-turnstile-response': 'test-turnstile-token',
  website: '',
};

describe('HMAC signing and Apps Script forward', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns refCode on successful Apps Script response', async () => {
    mockAppsScript(() => ({ ok: true, refCode: 'KF-HMAC1' }));
    const token = await getToken();
    const ctx = createExecutionContext();
    const resp = await worker.fetch(
      new Request('http://localhost/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validRegBody, formToken: token }),
      }),
      env, ctx
    );
    await waitOnExecutionContext(ctx);
    const data = await resp.json();
    expect(data.ok).toBe(true);
    expect(data.refCode).toBe('KF-HMAC1');
  });

  it('includes _ts, _nonce, _sig transport fields in forwarded body', async () => {
    let capturedBody = null;
    mockAppsScript((body) => {
      capturedBody = body;
      return { ok: true, refCode: 'KF-HMAC2' };
    });
    const token = await getToken();
    const ctx = createExecutionContext();
    await worker.fetch(
      new Request('http://localhost/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validRegBody, formToken: token }),
      }),
      env, ctx
    );
    await waitOnExecutionContext(ctx);
    expect(capturedBody).not.toBeNull();
    expect(typeof capturedBody._ts).toBe('string');
    expect(typeof capturedBody._nonce).toBe('string');
    expect(typeof capturedBody._sig).toBe('string');
    expect(capturedBody._sig.length).toBe(64); // 32-byte HMAC-SHA256 as hex
  });

  it('returns UPSTREAM_ERROR when Apps Script returns HTTP 500', async () => {
    const originalFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (url, opts) => {
      if (typeof url === 'string' && url.includes('siteverify')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (typeof url === 'string' && url.includes('script.google.com')) {
        return new Response('Internal Error', { status: 500 });
      }
      return originalFetch(url, opts);
    });
    const token = await getToken();
    const ctx = createExecutionContext();
    const resp = await worker.fetch(
      new Request('http://localhost/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validRegBody, formToken: token }),
      }),
      env, ctx
    );
    await waitOnExecutionContext(ctx);
    const data = await resp.json();
    expect(data.ok).toBe(false);
    expect(data.code).toBe('UPSTREAM_ERROR');
  });
});
