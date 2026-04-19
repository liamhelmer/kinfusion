import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../index.js';

describe('Security headers', () => {
  it('POST /api/register includes Content-Security-Policy', async () => {
    const ctx = createExecutionContext();
    const request = new Request('http://localhost/api/register', { method: 'POST' });
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.headers.get('Content-Security-Policy')).toBeTruthy();
  });

  it('CSP allowlists challenges.cloudflare.com for Turnstile', async () => {
    const ctx = createExecutionContext();
    const request = new Request('http://localhost/api/register', { method: 'POST' });
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    const csp = response.headers.get('Content-Security-Policy');
    expect(csp).toContain('challenges.cloudflare.com');
  });

  it('Strict-Transport-Security header is present', async () => {
    const ctx = createExecutionContext();
    const request = new Request('http://localhost/api/register', { method: 'POST' });
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.headers.get('Strict-Transport-Security')).toContain('max-age=31536000');
  });

  it('X-Content-Type-Options is nosniff', async () => {
    const ctx = createExecutionContext();
    const request = new Request('http://localhost/api/register', { method: 'POST' });
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('GET /api/register returns 405', async () => {
    const ctx = createExecutionContext();
    const request = new Request('http://localhost/api/register', { method: 'GET' });
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(405);
  });
});
