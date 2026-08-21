/** Pure helpers shared by payment Gmail and spreadsheet reconciliation. */

function _paymentHeaderMap(headers) {
  var result = {};
  (headers || []).forEach(function (header) {
    if (header && header.name) result[String(header.name).toLowerCase()] = String(header.value || '');
  });
  return result;
}

function _paymentDecodeBase64Url(data) {
  if (!data) return '';
  if (typeof Utilities !== 'undefined') {
    return Utilities.newBlob(Utilities.base64DecodeWebSafe(data)).getDataAsString('UTF-8');
  }
  var normalized = String(data).replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4) normalized += '=';
  var binary = atob(normalized);
  var escaped = '';
  for (var i = 0; i < binary.length; i++) {
    escaped += '%' + ('0' + binary.charCodeAt(i).toString(16)).slice(-2);
  }
  return decodeURIComponent(escaped);
}

function _paymentHtmlToText(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function _paymentCleanText(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function _paymentCollectBodies(part, bodies) {
  if (!part || part.filename || (part.body && part.body.attachmentId)) return;
  var mimeType = String(part.mimeType || '').toLowerCase();
  if (part.body && part.body.data && (mimeType === 'text/plain' || mimeType === 'text/html')) {
    var decoded = _paymentDecodeBase64Url(part.body.data);
    bodies[mimeType === 'text/plain' ? 'plain' : 'html'].push(decoded);
  }
  (part.parts || []).forEach(function (child) {
    _paymentCollectBodies(child, bodies);
  });
}

function _paymentNormalizeBody(payload) {
  var bodies = { plain: [], html: [] };
  _paymentCollectBodies(payload || {}, bodies);
  if (bodies.plain.length) return _paymentCleanText(bodies.plain.join('\n'));
  return _paymentCleanText(_paymentHtmlToText(bodies.html.join('\n')));
}

function _paymentClassifyProvider(headers) {
  var map = Array.isArray(headers) ? _paymentHeaderMap(headers) : (headers || {});
  var haystack = ((map.from || '') + ' ' + (map.subject || '')).toLowerCase();
  if (haystack.indexOf('wise') !== -1 || haystack.indexOf('transferwise') !== -1) return 'wise';
  if (haystack.indexOf('interac') !== -1 || haystack.indexOf('etransfer') !== -1 || haystack.indexOf('e-transfer') !== -1) return 'interac';
  return 'unknown';
}

function _paymentNormalizeCandidate(message) {
  var headers = _paymentHeaderMap(message && message.payload && message.payload.headers);
  return {
    messageId: String(message.id || ''),
    threadId: String(message.threadId || ''),
    provider: _paymentClassifyProvider(headers),
    receivedAt: new Date(Number(message.internalDate)).toISOString(),
    headers: {
      from: headers.from || '',
      to: headers.to || '',
      replyTo: headers['reply-to'] || '',
      subject: headers.subject || '',
    },
    body: _paymentNormalizeBody(message.payload || {}),
  };
}

function _paymentValidateAllocations(payload) {
  if (!payload || !String(payload.messageId || '').trim()) return { ok: false, error: 'message_id_required' };
  var receivedAt = String(payload.receivedAt || '');
  if (!receivedAt || isNaN(Date.parse(receivedAt))) return { ok: false, error: 'received_at_invalid' };
  if (!Array.isArray(payload.allocations) || !payload.allocations.length) return { ok: false, error: 'allocations_required' };

  var seen = {};
  var normalized = [];
  for (var i = 0; i < payload.allocations.length; i++) {
    var allocation = payload.allocations[i] || {};
    var refCode = String(allocation.refCode || '').trim().toUpperCase();
    if (!refCode) return { ok: false, error: 'ref_code_required' };
    if (seen[refCode]) return { ok: false, error: 'duplicate_ref_code' };
    if (!Number.isInteger(allocation.amountCents) || allocation.amountCents <= 0) {
      return { ok: false, error: 'amount_cents_invalid' };
    }
    seen[refCode] = true;
    normalized.push({
      refCode: refCode,
      amountCents: allocation.amountCents,
      notes: String(allocation.notes || '').trim(),
    });
  }

  return {
    ok: true,
    value: {
      messageId: String(payload.messageId).trim(),
      receivedAt: new Date(receivedAt).toISOString(),
      allocations: normalized,
    },
  };
}

function _paymentHeaderIndex(headers) {
  var result = {};
  (headers || []).forEach(function (header, index) {
    result[String(header)] = index;
  });
  return result;
}

function _paymentCompareBalance(paidCents, expectedCents) {
  if (!Number.isInteger(paidCents) || !Number.isInteger(expectedCents) || expectedCents < 0) return 'unclear';
  if (paidCents === 0) return 'unpaid';
  if (Math.abs(paidCents - expectedCents) <= 1) return 'paid';
  if (paidCents < expectedCents) return 'partial';
  return 'overpaid';
}

function _paymentAmountToCents(value) {
  if (value === null || value === undefined || value === '') return null;
  var normalized = typeof value === 'number'
    ? value
    : Number(String(value).replace(/[^0-9.,-]/g, '').replace(/,/g, ''));
  if (!isFinite(normalized)) return null;
  return Math.round(normalized * 100);
}

// Vitest executes Apps Script files as modules; this exposes the real helpers
// without adding module syntax that Apps Script V8 cannot parse.
if (typeof globalThis !== 'undefined') {
  globalThis.__kinfusionPaymentHelpers = {
    _paymentHeaderMap: _paymentHeaderMap,
    _paymentDecodeBase64Url: _paymentDecodeBase64Url,
    _paymentNormalizeBody: _paymentNormalizeBody,
    _paymentClassifyProvider: _paymentClassifyProvider,
    _paymentNormalizeCandidate: _paymentNormalizeCandidate,
    _paymentValidateAllocations: _paymentValidateAllocations,
    _paymentHeaderIndex: _paymentHeaderIndex,
    _paymentCompareBalance: _paymentCompareBalance,
    _paymentAmountToCents: _paymentAmountToCents,
  };
}
