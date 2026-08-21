/** Pure helpers shared by payment Gmail and spreadsheet reconciliation. */

function paymentHeaderMap_(headers) {
  var result = {};
  (headers || []).forEach(function (header) {
    if (header && header.name) result[String(header.name).toLowerCase()] = String(header.value || '');
  });
  return result;
}

function paymentDecodeBase64Url_(data) {
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

function paymentHtmlToText_(html) {
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

function paymentCleanText_(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function paymentCollectBodies_(part, bodies) {
  if (!part || part.filename || (part.body && part.body.attachmentId)) return;
  var mimeType = String(part.mimeType || '').toLowerCase();
  if (part.body && part.body.data && (mimeType === 'text/plain' || mimeType === 'text/html')) {
    var decoded = paymentDecodeBase64Url_(part.body.data);
    bodies[mimeType === 'text/plain' ? 'plain' : 'html'].push(decoded);
  }
  (part.parts || []).forEach(function (child) {
    paymentCollectBodies_(child, bodies);
  });
}

function paymentNormalizeBody_(payload) {
  var bodies = { plain: [], html: [] };
  paymentCollectBodies_(payload || {}, bodies);
  if (bodies.plain.length) return paymentCleanText_(bodies.plain.join('\n'));
  return paymentCleanText_(paymentHtmlToText_(bodies.html.join('\n')));
}

function paymentClassifyProvider_(headers) {
  var map = Array.isArray(headers) ? paymentHeaderMap_(headers) : (headers || {});
  var haystack = ((map.from || '') + ' ' + (map.subject || '')).toLowerCase();
  if (haystack.indexOf('wise') !== -1 || haystack.indexOf('transferwise') !== -1) return 'wise';
  if (haystack.indexOf('interac') !== -1 || haystack.indexOf('etransfer') !== -1 || haystack.indexOf('e-transfer') !== -1) return 'interac';
  return 'unknown';
}

function paymentClassifyTransferState_(headers, body) {
  var map = Array.isArray(headers) ? paymentHeaderMap_(headers) : (headers || {});
  var haystack = ((map.subject || '') + ' ' + (body || '')).toLowerCase();
  if (/\b(refund(?:ed)?|returned to (?:the )?sender)\b/.test(haystack)) return 'refunded';
  if (/\bcancel(?:led|ed|lation)?\b/.test(haystack)) return 'cancelled';
  if (/\bexpir(?:e|ed|y)\b/.test(haystack)) return 'expired';
  if (/\b(declin(?:e|ed)|fail(?:ed|ure))\b/.test(haystack)) return 'declined';
  if (/\b(pending|processing|on hold|awaiting)\b/.test(haystack)) return 'pending';
  if (/\b(complete(?:d)?|deposited|received|successful(?:ly)?)\b/.test(haystack)) return 'completed';
  return 'unknown';
}

function paymentNormalizeCandidate_(message) {
  var headers = paymentHeaderMap_(message && message.payload && message.payload.headers);
  var body = paymentNormalizeBody_(message.payload || {});
  return {
    messageId: String(message.id || ''),
    threadId: String(message.threadId || ''),
    provider: paymentClassifyProvider_(headers),
    state: paymentClassifyTransferState_(headers, body),
    receivedAt: new Date(Number(message.internalDate)).toISOString(),
    headers: {
      from: headers.from || '',
      to: headers.to || '',
      replyTo: headers['reply-to'] || '',
      subject: headers.subject || '',
    },
    body: body,
  };
}

function paymentValidateAllocations_(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false, error: 'payload_invalid' };
  var payloadKeys = Object.keys(payload);
  if (payloadKeys.some(function (key) { return ['messageId', 'receivedAt', 'allocations'].indexOf(key) === -1; })) {
    return { ok: false, error: 'payload_unknown_field' };
  }
  if (payloadKeys.some(function (key) { return key === '__proto__' || key === 'constructor'; })) {
    return { ok: false, error: 'payload_unknown_field' };
  }
  var messageId = String(payload.messageId || '').trim();
  if (!messageId || messageId.length > 256) return { ok: false, error: 'message_id_required' };
  var receivedAt = String(payload.receivedAt || '');
  if (!receivedAt || isNaN(Date.parse(receivedAt))) return { ok: false, error: 'received_at_invalid' };
  if (!Array.isArray(payload.allocations) || !payload.allocations.length || payload.allocations.length > 50) {
    return { ok: false, error: 'allocations_required' };
  }

  var seen = {};
  var normalized = [];
  for (var i = 0; i < payload.allocations.length; i++) {
    var allocation = payload.allocations[i];
    if (!allocation || typeof allocation !== 'object' || Array.isArray(allocation)) {
      return { ok: false, error: 'allocation_invalid' };
    }
    var allocationKeys = Object.keys(allocation);
    if (allocationKeys.some(function (key) { return ['refCode', 'amountCents', 'notes'].indexOf(key) === -1; })) {
      return { ok: false, error: 'allocation_unknown_field' };
    }
    var refCode = String(allocation.refCode || '').trim().toUpperCase();
    if (!refCode || refCode.length > 64) return { ok: false, error: 'ref_code_required' };
    if (seen[refCode]) return { ok: false, error: 'duplicate_ref_code' };
    if (!Number.isSafeInteger(allocation.amountCents) || allocation.amountCents <= 0) {
      return { ok: false, error: 'amount_cents_invalid' };
    }
    var notes = String(allocation.notes || '').trim();
    if (notes.length > 500) return { ok: false, error: 'notes_too_long' };
    seen[refCode] = true;
    normalized.push({
      refCode: refCode,
      amountCents: allocation.amountCents,
      notes: notes,
    });
  }

  return {
    ok: true,
    value: {
      messageId: messageId,
      receivedAt: new Date(receivedAt).toISOString(),
      allocations: normalized,
    },
  };
}

function paymentHeaderIndex_(headers) {
  var result = {};
  (headers || []).forEach(function (header, index) {
    result[String(header)] = index;
  });
  return result;
}

function paymentCompareBalance_(paidCents, expectedCents) {
  if (!Number.isInteger(paidCents) || !Number.isInteger(expectedCents) || expectedCents < 0) return 'unclear';
  if (paidCents === 0) return 'unpaid';
  if (Math.abs(paidCents - expectedCents) <= 1) return 'paid';
  if (paidCents < expectedCents) return 'partial';
  return 'overpaid';
}

function paymentAmountToCents_(value) {
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
    paymentHeaderMap_: paymentHeaderMap_,
    paymentDecodeBase64Url_: paymentDecodeBase64Url_,
    paymentNormalizeBody_: paymentNormalizeBody_,
    paymentClassifyProvider_: paymentClassifyProvider_,
    paymentClassifyTransferState_: paymentClassifyTransferState_,
    paymentNormalizeCandidate_: paymentNormalizeCandidate_,
    paymentValidateAllocations_: paymentValidateAllocations_,
    paymentHeaderIndex_: paymentHeaderIndex_,
    paymentCompareBalance_: paymentCompareBalance_,
    paymentAmountToCents_: paymentAmountToCents_,
  };
}
