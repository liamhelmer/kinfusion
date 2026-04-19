import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../index.js';

describe('Form token (POST /api/form-token)', () => {
  it('issues a token on POST /api/form-token', async () => {
    const ctx = createExecutionContext();
    const resp = await worker.fetch(
      new Request('http://localhost/api/form-token', { method: 'POST' }),
      env, ctx
    );
    await waitOnExecutionContext(ctx);
    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(data.ok).toBe(true);
    expect(typeof data.token).toBe('string');
    expect(data.token.split('.').length).toBe(3);
  });

  it('accepts a form submission with a valid token', async () => {
    const ctx1 = createExecutionContext();
    const tokenResp = await worker.fetch(
      new Request('http://localhost/api/form-token', { method: 'POST' }),
      env, ctx1
    );
    await waitOnExecutionContext(ctx1);
    const { token } = await tokenResp.json();

    const ctx2 = createExecutionContext();
    const submitResp = await worker.fetch(
      new Request('http://localhost/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formToken: token }),
      }),
      env, ctx2
    );
    await waitOnExecutionContext(ctx2);
    // Token is valid — should not reject on token grounds (may fail later for other reasons)
    const data = await submitResp.json();
    expect(data.code).not.toBe('FORM_TOKEN_INVALID');
    expect(data.code).not.toBe('FORM_TOKEN_MISSING');
    expect(data.code).not.toBe('FORM_TOKEN_EXPIRED');
  });

  it('rejects a replayed token (second use)', async () => {
    const ctx1 = createExecutionContext();
    const tokenResp = await worker.fetch(
      new Request('http://localhost/api/form-token', { method: 'POST' }),
      env, ctx1
    );
    await waitOnExecutionContext(ctx1);
    const { token } = await tokenResp.json();

    // First use — consume the token
    const ctx2 = createExecutionContext();
    await worker.fetch(
      new Request('http://localhost/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formToken: token }),
      }),
      env, ctx2
    );
    await waitOnExecutionContext(ctx2);

    // Second use — should be rejected
    const ctx3 = createExecutionContext();
    const replayResp = await worker.fetch(
      new Request('http://localhost/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formToken: token }),
      }),
      env, ctx3
    );
    await waitOnExecutionContext(ctx3);
    const data = await replayResp.json();
    expect(data.code).toBe('FORM_TOKEN_INVALID');
  });

  it('rejects a missing form token', async () => {
    const ctx = createExecutionContext();
    const resp = await worker.fetch(
      new Request('http://localhost/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      env, ctx
    );
    await waitOnExecutionContext(ctx);
    const data = await resp.json();
    expect(data.code).toBe('FORM_TOKEN_MISSING');
  });
});
