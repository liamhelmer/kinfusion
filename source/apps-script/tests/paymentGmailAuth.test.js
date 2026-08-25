import { beforeEach, describe, expect, test, vi } from 'vitest';
import '../Code.js';
import '../paymentGmailAuth.js';

const VALID_INVITE_TOKEN = 'invite-token-1234567890abcdef12345678';
const VALID_CALLBACK_TOKEN = 'callback-token-1234567890abcdef123456';

function makeProps(initial = {}) {
  const store = { ...initial };
  return {
    getProperty: (key) => store[key] ?? null,
    setProperty: (key, value) => { store[key] = String(value); },
    deleteProperty: (key) => { delete store[key]; },
    _store: store,
  };
}

function fakeDigestBytes(value) {
  const bytes = new Array(32).fill(0);
  Array.from(String(value)).forEach((character, index) => {
    bytes[index % bytes.length] = (bytes[index % bytes.length] * 31 + character.charCodeAt(0) + index) & 255;
  });
  return bytes;
}

function digestHex(value) {
  return fakeDigestBytes(value)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function validInviteProperties(token = VALID_INVITE_TOKEN) {
  return {
    PAYMENT_GMAIL_INVITE_DIGEST: digestHex(token),
    PAYMENT_GMAIL_INVITE_EXPIRES_AT: String(Date.now() + 60_000),
  };
}

function validCallbackProperties(token = VALID_CALLBACK_TOKEN) {
  return {
    PAYMENT_GMAIL_CALLBACK_DIGEST: digestHex(token),
    PAYMENT_GMAIL_CALLBACK_EXPIRES_AT: String(Date.now() + 60_000),
  };
}

function callbackRequest(parameters = {}) {
  return { parameter: { code: 'code', state: VALID_CALLBACK_TOKEN, ...parameters } };
}

function installGlobals({ properties = {}, access = false, profileEmail = 'payments@example.com', callbackAccepted = true, callbackError = null, fetchError = null, activeEmail = 'kinfusion.campout@gmail.com' } = {}) {
  const props = makeProps(properties);
  const params = {};
  const service = {
    setAuthorizationBaseUrl: vi.fn().mockReturnThis(),
    setTokenUrl: vi.fn().mockReturnThis(),
    setClientId: vi.fn().mockReturnThis(),
    setClientSecret: vi.fn().mockReturnThis(),
    setCallbackFunction: vi.fn().mockReturnThis(),
    setRedirectUri: vi.fn().mockReturnThis(),
    setPropertyStore: vi.fn().mockReturnThis(),
    setCache: vi.fn().mockReturnThis(),
    setLock: vi.fn().mockReturnThis(),
    setScope: vi.fn().mockReturnThis(),
    setParam: vi.fn((name, value) => { params[name] = value; return service; }),
    hasAccess: vi.fn(() => access),
    getAuthorizationUrl: vi.fn(() => 'https://accounts.google.com/authorize'),
    handleCallback: vi.fn(() => {
      if (callbackError) throw callbackError;
      return callbackAccepted;
    }),
    getAccessToken: vi.fn(() => 'never-return-this-token'),
    getLastError: vi.fn(() => 'grant expired'),
    reset: vi.fn(),
  };

  globalThis.PropertiesService = { getScriptProperties: () => props };
  globalThis.CacheService = { getScriptCache: () => ({}) };
  const scriptLock = { waitLock: vi.fn(), releaseLock: vi.fn() };
  globalThis.LockService = { getScriptLock: () => scriptLock };
  globalThis.Session = {
    getActiveUser: () => ({ getEmail: () => activeEmail }),
  };
  globalThis.ScriptApp = {
    getService: () => ({
      getUrl: () => 'https://script.google.com/macros/s/deployment-id/exec',
    }),
  };
  globalThis.assertController_ = globalThis.__kinfusionController.assertController_;
  globalThis.OAuth2 = { createService: vi.fn(() => service) };
  globalThis.Utilities = {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    computeDigest: vi.fn((_algorithm, value) => fakeDigestBytes(value)),
    getUuid: vi.fn()
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222')
      .mockReturnValueOnce('33333333-3333-4333-8333-333333333333')
      .mockReturnValueOnce('44444444-4444-4444-8444-444444444444'),
  };
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

  return { props, service, params, scriptLock };
}

beforeEach(() => {
  vi.useFakeTimers().setSystemTime(new Date('2026-08-25T04:00:00.000Z'));
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

  test('reports authorization required without generating a raw state URL', () => {
    const { params, service } = installGlobals({
      properties: {
        PAYMENT_GMAIL_CLIENT_ID: 'client-id',
        PAYMENT_GMAIL_CLIENT_SECRET: 'client-secret',
        PAYMENT_GMAIL_EXPECTED_ADDRESS: 'payments@example.com',
      },
    });

    const result = globalThis.getPaymentGmailAuthStatus();

    expect(result).toEqual({
      ok: true,
      authorized: false,
      expectedAddress: 'payments@example.com',
      authorizedAddress: '',
      error: 'authorization_required',
    });
    expect(params).toEqual({ access_type: 'offline', prompt: 'consent', login_hint: 'payments@example.com' });
    expect(service.getAuthorizationUrl).not.toHaveBeenCalled();
  });

  test('rejects controller APIs from an anonymous HTML-service call', () => {
    installGlobals({
      activeEmail: '',
      properties: {
        PAYMENT_GMAIL_CLIENT_ID: 'client-id',
        PAYMENT_GMAIL_CLIENT_SECRET: 'client-secret',
        PAYMENT_GMAIL_EXPECTED_ADDRESS: 'payments@example.com',
      },
    });

    expect(() => globalThis.getPaymentGmailAuthStatus()).toThrow('controller_access_required');
    expect(() => globalThis.createPaymentGmailAuthorizationInvite()).toThrow('controller_access_required');
    expect(() => globalThis.resetPaymentGmailAuthorization()).toThrow('controller_access_required');
  });

  test('keeps the OAuth callback implementation off the public script.run surface', () => {
    installGlobals();

    expect(globalThis.paymentGmailAuthCallback).toBeUndefined();
    expect(typeof globalThis.__kinfusionPaymentGmailAuth.paymentGmailAuthCallback_).toBe('function');
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
  test('routes a web-app callback and binds a matching Gmail profile', () => {
    const { props } = installGlobals({
      access: true,
      profileEmail: 'Payments@Example.com',
      properties: {
        PAYMENT_GMAIL_CLIENT_ID: 'client-id',
        PAYMENT_GMAIL_CLIENT_SECRET: 'client-secret',
        PAYMENT_GMAIL_EXPECTED_ADDRESS: 'payments@example.com',
        ...validCallbackProperties(),
      },
    });

    const html = globalThis.doGet(callbackRequest()).getContent();

    expect(props._store.PAYMENT_GMAIL_AUTHORIZED_ADDRESS).toBe('Payments@Example.com');
    expect(props._store.PAYMENT_GMAIL_AUTHORIZED_CLIENT_ID).toBe('client-id');
    expect(props._store.PAYMENT_GMAIL_CALLBACK_DIGEST).toBeUndefined();
    expect(props._store.PAYMENT_GMAIL_CALLBACK_EXPIRES_AT).toBeUndefined();
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
        ...validCallbackProperties(),
      },
    });

    const html = globalThis.__kinfusionPaymentGmailAuth.paymentGmailAuthCallback_(callbackRequest()).getContent();

    expect(service.reset).toHaveBeenCalledOnce();
    expect(props._store.PAYMENT_GMAIL_AUTHORIZED_ADDRESS).toBeUndefined();
    expect(html).toContain('Wrong Google account');
    expect(html).toContain('payments@example.com');
  });

  test('routes denied consent without replacing an existing authorization', () => {
    const { props, service } = installGlobals({
      callbackAccepted: false,
      properties: {
        PAYMENT_GMAIL_CLIENT_ID: 'client-id',
        PAYMENT_GMAIL_CLIENT_SECRET: 'client-secret',
        PAYMENT_GMAIL_EXPECTED_ADDRESS: 'payments@example.com',
        PAYMENT_GMAIL_AUTHORIZED_ADDRESS: 'payments@example.com',
        ...validCallbackProperties(),
      },
    });

    const html = globalThis.doGet(callbackRequest({ code: '', error: 'access_denied' })).getContent();
    expect(props._store.PAYMENT_GMAIL_AUTHORIZED_ADDRESS).toBe('payments@example.com');
    expect(service.reset).not.toHaveBeenCalled();
    expect(html).toContain('Authorization was not completed');
  });

  test('preserves an existing authorization when token exchange fails', () => {
    const { props, service } = installGlobals({
      access: true,
      callbackError: new Error('invalid_grant'),
      properties: {
        PAYMENT_GMAIL_CLIENT_ID: 'client-id',
        PAYMENT_GMAIL_CLIENT_SECRET: 'client-secret',
        PAYMENT_GMAIL_EXPECTED_ADDRESS: 'payments@example.com',
        PAYMENT_GMAIL_AUTHORIZED_ADDRESS: 'payments@example.com',
        PAYMENT_GMAIL_AUTHORIZED_CLIENT_ID: 'client-id',
        ...validCallbackProperties(),
      },
    });

    const html = globalThis.doGet(callbackRequest({ code: 'forged-code' })).getContent();

    expect(props._store.PAYMENT_GMAIL_AUTHORIZED_ADDRESS).toBe('payments@example.com');
    expect(props._store.PAYMENT_GMAIL_AUTHORIZED_CLIENT_ID).toBe('client-id');
    expect(service.reset).not.toHaveBeenCalled();
    expect(html).toContain('Authorization verification failed');
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
        ...validCallbackProperties(),
      },
    });

    const html = globalThis.__kinfusionPaymentGmailAuth.paymentGmailAuthCallback_(callbackRequest()).getContent();
    expect(service.reset).toHaveBeenCalledOnce();
    expect(props._store.PAYMENT_GMAIL_AUTHORIZED_ADDRESS).toBeUndefined();
    expect(html).toContain('Authorization verification failed');
  });

  test('rejects a callback without a valid callback nonce before touching a stored grant', () => {
    const { props, service } = installGlobals({
      access: true,
      properties: {
        PAYMENT_GMAIL_CLIENT_ID: 'client-id',
        PAYMENT_GMAIL_CLIENT_SECRET: 'client-secret',
        PAYMENT_GMAIL_EXPECTED_ADDRESS: 'payments@example.com',
        PAYMENT_GMAIL_AUTHORIZED_ADDRESS: 'payments@example.com',
        PAYMENT_GMAIL_AUTHORIZED_CLIENT_ID: 'client-id',
      },
    });

    const html = globalThis.__kinfusionPaymentGmailAuth.paymentGmailAuthCallback_({ parameter: { code: 'code' } }).getContent();

    expect(service.handleCallback).not.toHaveBeenCalled();
    expect(service.reset).not.toHaveBeenCalled();
    expect(props._store.PAYMENT_GMAIL_AUTHORIZED_ADDRESS).toBe('payments@example.com');
    expect(props._store.PAYMENT_GMAIL_AUTHORIZED_CLIENT_ID).toBe('client-id');
    expect(html).toContain('Authorization link expired');
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

describe('payment Gmail authorization invitations', () => {
  test('creates a short-lived invite while storing only its digest', () => {
    const { props } = installGlobals({
      properties: {
        PAYMENT_GMAIL_CLIENT_ID: 'client-id',
        PAYMENT_GMAIL_CLIENT_SECRET: 'client-secret',
        PAYMENT_GMAIL_EXPECTED_ADDRESS: 'payments@example.com',
      },
    });

    const result = globalThis.createPaymentGmailAuthorizationInvite();

    expect(result).toMatchObject({ ok: true, expectedAddress: 'payments@example.com' });
    expect(result.inviteToken).toMatch(/^[0-9a-f-]{72}$/);
    expect(result.expiresAt).toBe(Date.now() + 30 * 60 * 1000);
    expect(props._store.PAYMENT_GMAIL_INVITE_DIGEST).toBe(digestHex(result.inviteToken));
    expect(JSON.stringify(props._store)).not.toContain(result.inviteToken);
  });

  test('starts OAuth only for a valid unexpired invite', () => {
    const { props, service, params, scriptLock } = installGlobals({
      properties: {
        PAYMENT_GMAIL_CLIENT_ID: 'client-id',
        PAYMENT_GMAIL_CLIENT_SECRET: 'client-secret',
        PAYMENT_GMAIL_EXPECTED_ADDRESS: 'payments@example.com',
        ...validInviteProperties(),
      },
    });

    expect(globalThis.startPaymentGmailAuthorization(VALID_INVITE_TOKEN)).toMatchObject({
      ok: true,
      authorizationUrl: 'https://accounts.google.com/authorize',
    });
    expect(service.setRedirectUri).toHaveBeenCalledWith(
      'https://script.google.com/macros/s/deployment-id/exec'
    );
    expect(service.getAuthorizationUrl).toHaveBeenCalledWith();
    expect(params.state).toBe(
      '11111111-1111-4111-8111-11111111111122222222-2222-4222-8222-222222222222'
    );
    expect(props._store.PAYMENT_GMAIL_INVITE_DIGEST).toBeUndefined();
    expect(props._store.PAYMENT_GMAIL_CALLBACK_DIGEST).toBe(
      digestHex('11111111-1111-4111-8111-11111111111122222222-2222-4222-8222-222222222222')
    );
    expect(scriptLock.waitLock).toHaveBeenCalledWith(10000);
    expect(scriptLock.releaseLock).toHaveBeenCalledOnce();
  });

  test('rejects expired invites without generating an OAuth state token', () => {
    const { service } = installGlobals({
      properties: {
        PAYMENT_GMAIL_CLIENT_ID: 'client-id',
        PAYMENT_GMAIL_CLIENT_SECRET: 'client-secret',
        PAYMENT_GMAIL_EXPECTED_ADDRESS: 'payments@example.com',
        PAYMENT_GMAIL_INVITE_DIGEST: digestHex(VALID_INVITE_TOKEN),
        PAYMENT_GMAIL_INVITE_EXPIRES_AT: String(Date.now() - 1),
      },
    });

    expect(globalThis.startPaymentGmailAuthorization(VALID_INVITE_TOKEN)).toEqual({
      ok: false,
      error: 'authorization_invite_expired',
    });
    expect(service.getAuthorizationUrl).not.toHaveBeenCalled();
  });

  test('renders a guarded connection page for the mailbox owner', () => {
    installGlobals({
      properties: {
        PAYMENT_GMAIL_CLIENT_ID: 'client-id',
        PAYMENT_GMAIL_CLIENT_SECRET: 'client-secret',
        PAYMENT_GMAIL_EXPECTED_ADDRESS: 'payments@example.com',
        ...validInviteProperties(),
      },
    });

    const html = globalThis.doGet({ parameter: { paymentAuth: '1', invite: VALID_INVITE_TOKEN } }).getContent();

    expect(html).toContain('Connect payment mailbox');
    expect(html).toContain('payments@example.com');
    expect(html).toContain('startPaymentGmailAuthorization');
    expect(html).not.toContain('client-secret');
  });
});
