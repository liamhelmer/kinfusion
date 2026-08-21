import { beforeEach, describe, expect, test, vi } from 'vitest';
import '../paymentGmailAuth.js';

function makeProps(initial = {}) {
  const store = { ...initial };
  return {
    getProperty: (key) => store[key] ?? null,
    setProperty: (key, value) => { store[key] = String(value); },
    deleteProperty: (key) => { delete store[key]; },
    _store: store,
  };
}

function installGlobals({ properties = {}, access = false, profileEmail = 'payments@example.com', callbackAccepted = true, fetchError = null } = {}) {
  const props = makeProps(properties);
  const params = {};
  const service = {
    setAuthorizationBaseUrl: vi.fn().mockReturnThis(),
    setTokenUrl: vi.fn().mockReturnThis(),
    setClientId: vi.fn().mockReturnThis(),
    setClientSecret: vi.fn().mockReturnThis(),
    setCallbackFunction: vi.fn().mockReturnThis(),
    setPropertyStore: vi.fn().mockReturnThis(),
    setCache: vi.fn().mockReturnThis(),
    setLock: vi.fn().mockReturnThis(),
    setScope: vi.fn().mockReturnThis(),
    setParam: vi.fn((name, value) => { params[name] = value; return service; }),
    hasAccess: vi.fn(() => access),
    getAuthorizationUrl: vi.fn(() => 'https://accounts.google.com/authorize'),
    handleCallback: vi.fn(() => callbackAccepted),
    getAccessToken: vi.fn(() => 'never-return-this-token'),
    getLastError: vi.fn(() => 'grant expired'),
    reset: vi.fn(),
  };

  globalThis.PropertiesService = { getScriptProperties: () => props };
  globalThis.CacheService = { getScriptCache: () => ({}) };
  globalThis.LockService = { getScriptLock: () => ({}) };
  globalThis.OAuth2 = { createService: vi.fn(() => service) };
  globalThis.UrlFetchApp = {
    fetch: vi.fn(() => {
      if (fetchError) throw fetchError;
      return ({
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({ emailAddress: profileEmail }),
      });
    }),
  };
  globalThis.HtmlService = {
    createHtmlOutput: (content) => ({ getContent: () => content }),
  };

  return { props, service, params };
}

beforeEach(() => {
  delete globalThis.PropertiesService;
  delete globalThis.OAuth2;
  delete globalThis.UrlFetchApp;
});

describe('payment Gmail OAuth configuration', () => {
  test('reports missing configuration without secret or token fields', () => {
    installGlobals();
    const result = globalThis.getPaymentGmailAuthStatus();

    expect(result).toEqual({
      ok: false,
      authorized: false,
      expectedAddress: '',
      authorizedAddress: '',
      error: 'payment_gmail_not_configured',
    });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(JSON.stringify(result)).not.toContain('token');
  });

  test('generates an offline forced-consent URL for the expected account', () => {
    const { params } = installGlobals({
      properties: {
        PAYMENT_GMAIL_CLIENT_ID: 'client-id',
        PAYMENT_GMAIL_CLIENT_SECRET: 'client-secret',
        PAYMENT_GMAIL_EXPECTED_ADDRESS: 'payments@example.com',
      },
    });

    const result = globalThis.getPaymentGmailAuthorizationUrl();

    expect(result).toEqual({
      ok: true,
      authorized: false,
      expectedAddress: 'payments@example.com',
      authorizedAddress: '',
      authorizationUrl: 'https://accounts.google.com/authorize',
    });
    expect(params).toEqual({ access_type: 'offline', prompt: 'consent', login_hint: 'payments@example.com' });
  });

  test('reports only safe fields when authorized', () => {
    installGlobals({
      access: true,
      properties: {
        PAYMENT_GMAIL_CLIENT_ID: 'client-id',
        PAYMENT_GMAIL_CLIENT_SECRET: 'client-secret',
        PAYMENT_GMAIL_EXPECTED_ADDRESS: 'payments@example.com',
        PAYMENT_GMAIL_AUTHORIZED_ADDRESS: 'payments@example.com',
        PAYMENT_GMAIL_AUTHORIZED_CLIENT_ID: 'client-id',
      },
    });

    expect(globalThis.getPaymentGmailAuthStatus()).toEqual({
      ok: true,
      authorized: true,
      expectedAddress: 'payments@example.com',
      authorizedAddress: 'payments@example.com',
    });
  });
});

describe('payment Gmail OAuth callback', () => {
  test('binds a matching Gmail profile', () => {
    const { props } = installGlobals({
      access: true,
      profileEmail: 'Payments@Example.com',
      properties: {
        PAYMENT_GMAIL_CLIENT_ID: 'client-id',
        PAYMENT_GMAIL_CLIENT_SECRET: 'client-secret',
        PAYMENT_GMAIL_EXPECTED_ADDRESS: 'payments@example.com',
      },
    });

    const html = globalThis.paymentGmailAuthCallback({ parameter: { code: 'code' } }).getContent();

    expect(props._store.PAYMENT_GMAIL_AUTHORIZED_ADDRESS).toBe('Payments@Example.com');
    expect(props._store.PAYMENT_GMAIL_AUTHORIZED_CLIENT_ID).toBe('client-id');
    expect(html).toContain('Authorization complete');
    expect(html).not.toContain('never-return-this-token');
  });

  test('resets a grant from the wrong Google account', () => {
    const { props, service } = installGlobals({
      access: true,
      profileEmail: 'wrong@example.com',
      properties: {
        PAYMENT_GMAIL_CLIENT_ID: 'client-id',
        PAYMENT_GMAIL_CLIENT_SECRET: 'client-secret',
        PAYMENT_GMAIL_EXPECTED_ADDRESS: 'payments@example.com',
        PAYMENT_GMAIL_AUTHORIZED_ADDRESS: 'old@example.com',
      },
    });

    const html = globalThis.paymentGmailAuthCallback({ parameter: { code: 'code' } }).getContent();

    expect(service.reset).toHaveBeenCalledOnce();
    expect(props._store.PAYMENT_GMAIL_AUTHORIZED_ADDRESS).toBeUndefined();
    expect(html).toContain('Wrong Google account');
    expect(html).toContain('payments@example.com');
  });

  test('reports denied consent without storing an address', () => {
    const { props, service } = installGlobals({
      callbackAccepted: false,
      properties: {
        PAYMENT_GMAIL_CLIENT_ID: 'client-id',
        PAYMENT_GMAIL_CLIENT_SECRET: 'client-secret',
        PAYMENT_GMAIL_EXPECTED_ADDRESS: 'payments@example.com',
        PAYMENT_GMAIL_AUTHORIZED_ADDRESS: 'payments@example.com',
      },
    });

    const html = globalThis.paymentGmailAuthCallback({ parameter: { error: 'access_denied' } }).getContent();
    expect(props._store.PAYMENT_GMAIL_AUTHORIZED_ADDRESS).toBeUndefined();
    expect(service.reset).toHaveBeenCalledOnce();
    expect(html).toContain('Authorization was not completed');
  });

  test('resets and clears binding when profile verification throws', () => {
    const { props, service } = installGlobals({
      access: true,
      fetchError: new Error('network unavailable'),
      properties: {
        PAYMENT_GMAIL_CLIENT_ID: 'client-id',
        PAYMENT_GMAIL_CLIENT_SECRET: 'client-secret',
        PAYMENT_GMAIL_EXPECTED_ADDRESS: 'payments@example.com',
        PAYMENT_GMAIL_AUTHORIZED_ADDRESS: 'payments@example.com',
      },
    });

    const html = globalThis.paymentGmailAuthCallback({ parameter: { code: 'code' } }).getContent();
    expect(service.reset).toHaveBeenCalledOnce();
    expect(props._store.PAYMENT_GMAIL_AUTHORIZED_ADDRESS).toBeUndefined();
    expect(html).toContain('Authorization verification failed');
  });

  test('blocks mailbox fetches until the stored address binding matches', () => {
    const { service } = installGlobals({
      access: true,
      properties: {
        PAYMENT_GMAIL_CLIENT_ID: 'client-id',
        PAYMENT_GMAIL_CLIENT_SECRET: 'client-secret',
        PAYMENT_GMAIL_EXPECTED_ADDRESS: 'payments@example.com',
        PAYMENT_GMAIL_AUTHORIZED_ADDRESS: 'payments@example.com',
        PAYMENT_GMAIL_AUTHORIZED_CLIENT_ID: 'old-client-id',
      },
    });

    const result = globalThis.__kinfusionPaymentGmailAuth.paymentGmailFetch_('/messages', { method: 'get' });
    expect(result).toMatchObject({ ok: false, error: 'authorized_account_unverified' });
    expect(globalThis.UrlFetchApp.fetch).not.toHaveBeenCalled();
    expect(service.getAccessToken).not.toHaveBeenCalled();
  });
});
