import { beforeEach, describe, expect, test, vi } from 'vitest';
import '../paymentHelpers.js';
import '../paymentGmailBridge.js';

function installBridge(fetchImpl, properties = {}) {
  globalThis.assertController_ = vi.fn();
  globalThis.paymentGmailFetch_ = vi.fn(fetchImpl);
  globalThis.paymentNormalizeCandidate_ = globalThis.__kinfusionPaymentHelpers.paymentNormalizeCandidate_;
  globalThis.PropertiesService = {
    getScriptProperties: () => ({ getProperty: (key) => properties[key] ?? null }),
  };
}

const message = (id, from, subject) => ({
  id,
  threadId: `thread-${id}`,
  internalDate: '1787200000000',
  payload: {
    mimeType: 'text/plain',
    headers: [
      { name: 'From', value: from },
      { name: 'To', value: 'payments@example.com' },
      { name: 'Subject', value: subject },
    ],
    body: { data: btoa('Deposit complete').replace(/=+$/, '') },
  },
});

const queries = {
  PAYMENT_GMAIL_INTERAC_QUERY: 'from:notify@interac.ca subject:(deposit)',
  PAYMENT_GMAIL_WISE_QUERY: 'from:wise.com subject:(received)',
};

beforeEach(() => {
  delete globalThis.paymentHasPendingMessage_;
});

describe('payment Gmail candidate scan', () => {
  test('requires controller access before reading Gmail', () => {
    installBridge(() => { throw new Error('must not fetch'); }, queries);
    globalThis.assertController_ = vi.fn(() => { throw new Error('controller_access_required'); });
    expect(() => globalThis.scanPaymentGmailCandidates({})).toThrow('controller_access_required');
    expect(globalThis.paymentGmailFetch_).not.toHaveBeenCalled();
  });

  test('uses only fixed configured queries, excludes labeled mail, and deduplicates IDs', () => {
    installBridge((path) => {
      if (path.includes('/messages?') && decodeURIComponent(path).includes('interac')) {
        return { ok: true, data: { messages: [{ id: 'a' }, { id: 'shared' }] } };
      }
      if (path.includes('/messages?')) return { ok: true, data: { messages: [{ id: 'shared' }, { id: 'b' }] } };
      if (path === '/messages/a?format=full') return { ok: true, data: message('a', 'notify@interac.ca', 'Interac deposit') };
      if (path === '/messages/shared?format=full') return { ok: true, data: message('shared', 'notify@wise.com', 'Wise received') };
      if (path === '/messages/b?format=full') return { ok: true, data: message('b', 'notify@wise.com', 'Wise received') };
      throw new Error(`unexpected ${path}`);
    }, queries);

    const result = globalThis.scanPaymentGmailCandidates({ maxResults: 10 });

    expect(result.ok).toBe(true);
    expect(result.candidates.map((item) => item.messageId)).toEqual(['a', 'shared', 'b']);
    const listPaths = globalThis.paymentGmailFetch_.mock.calls.slice(0, 2).map((call) => decodeURIComponent(call[0]));
    expect(listPaths).toEqual([
      '/messages?q=from:notify@interac.ca subject:(deposit) -label:kinfusion-etransfer&maxResults=10',
      '/messages?q=from:wise.com subject:(received) -label:kinfusion-etransfer&maxResults=10',
    ]);
  });

  test('rejects caller supplied Gmail query text', () => {
    installBridge(() => ({ ok: true, data: {} }), queries);
    expect(globalThis.scanPaymentGmailCandidates({ query: 'in:anywhere' })).toEqual({
      ok: false,
      error: 'unsupported_scan_options',
    });
  });

  test('requires both provider queries to be configured', () => {
    installBridge(() => ({ ok: true, data: {} }), {});
    expect(globalThis.scanPaymentGmailCandidates({})).toEqual({
      ok: false,
      error: 'payment_gmail_queries_not_configured',
    });
  });
});

describe('payment Gmail candidate boundary and label', () => {
  test('rejects an unrelated message ID', () => {
    installBridge((path) => {
      if (path.includes('/messages?')) return { ok: true, data: { messages: [{ id: 'candidate' }] } };
      throw new Error(`unexpected ${path}`);
    }, queries);

    expect(globalThis.__kinfusionPaymentGmailBridge.paymentCandidateBoundary_('other')).toEqual({
      ok: false,
      error: 'message_outside_candidate_boundary',
    });
  });

  test('allows a recorded label-pending message through the retry boundary', () => {
    installBridge(() => { throw new Error('Gmail search should not run'); }, queries);
    globalThis.paymentHasPendingMessage_ = (id) => id === 'pending';
    expect(globalThis.__kinfusionPaymentGmailBridge.paymentCandidateBoundary_('pending')).toEqual({ ok: true, retry: true });
  });

  test('creates the exact reconciliation label and applies it', () => {
    installBridge((path, options = {}) => {
      if (path === '/labels' && (!options.method || options.method === 'get')) return { ok: true, data: { labels: [] } };
      if (path === '/labels' && options.method === 'post') return { ok: true, data: { id: 'Label_42', name: 'kinfusion-etransfer' } };
      if (path === '/messages/msg-1/modify') return { ok: true, data: { id: 'msg-1', labelIds: ['Label_42'] } };
      throw new Error(`unexpected ${path}`);
    }, queries);

    expect(globalThis.__kinfusionPaymentGmailBridge.paymentApplyLabel_('msg-1')).toEqual({
      ok: true,
      messageId: 'msg-1',
      labelId: 'Label_42',
    });
    expect(globalThis.paymentGmailFetch_).toHaveBeenLastCalledWith('/messages/msg-1/modify', {
      method: 'post',
      payload: { addLabelIds: ['Label_42'], removeLabelIds: [] },
    });
  });
});
