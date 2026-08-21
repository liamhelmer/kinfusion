/** Narrow Gmail operations for Interac and Wise reconciliation candidates. */

var PAYMENT_RECONCILIATION_LABEL = 'kinfusion-etransfer';

function _paymentProviderQueries() {
  var props = PropertiesService.getScriptProperties();
  var interac = String(props.getProperty('PAYMENT_GMAIL_INTERAC_QUERY') || '').trim();
  var wise = String(props.getProperty('PAYMENT_GMAIL_WISE_QUERY') || '').trim();
  if (!interac || !wise) return null;
  return [interac, wise];
}

function _paymentListCandidateIds(query, maxResults) {
  var boundedQuery = query + ' -label:' + PAYMENT_RECONCILIATION_LABEL;
  var response = _paymentGmailFetch(
    '/messages?q=' + encodeURIComponent(boundedQuery) + '&maxResults=' + maxResults,
    { method: 'get' }
  );
  if (!response.ok) return response;
  return {
    ok: true,
    messageIds: (response.data.messages || []).map(function (message) { return String(message.id); }),
  };
}

function _paymentGetCandidateMessage(messageId) {
  var response = _paymentGmailFetch('/messages/' + encodeURIComponent(messageId) + '?format=full', { method: 'get' });
  if (!response.ok) return response;
  return { ok: true, candidate: _paymentNormalizeCandidate(response.data) };
}

function scanPaymentGmailCandidates(options) {
  options = options || {};
  var keys = Object.keys(options);
  for (var k = 0; k < keys.length; k++) {
    if (keys[k] !== 'maxResults') return { ok: false, error: 'unsupported_scan_options' };
  }
  var maxResults = options.maxResults === undefined ? 25 : Number(options.maxResults);
  if (!Number.isInteger(maxResults)) return { ok: false, error: 'max_results_invalid' };
  maxResults = Math.max(1, Math.min(50, maxResults));

  var queries = _paymentProviderQueries();
  if (!queries) return { ok: false, error: 'payment_gmail_queries_not_configured' };

  var ids = [];
  var seen = {};
  for (var i = 0; i < queries.length; i++) {
    var listed = _paymentListCandidateIds(queries[i], maxResults);
    if (!listed.ok) return listed;
    listed.messageIds.forEach(function (id) {
      if (!seen[id] && ids.length < maxResults) {
        seen[id] = true;
        ids.push(id);
      }
    });
  }

  var candidates = [];
  var errors = [];
  for (var j = 0; j < ids.length; j++) {
    var fetched = _paymentGetCandidateMessage(ids[j]);
    if (fetched.ok) candidates.push(fetched.candidate);
    else errors.push({ messageId: ids[j], error: fetched.error || 'message_fetch_failed' });
  }
  return { ok: true, candidates: candidates, errors: errors };
}

function _paymentCandidateBoundary(messageId) {
  messageId = String(messageId || '').trim();
  if (!messageId) return { ok: false, error: 'message_id_required' };
  if (typeof _paymentHasPendingMessage === 'function' && _paymentHasPendingMessage(messageId)) {
    return { ok: true, retry: true };
  }
  var queries = _paymentProviderQueries();
  if (!queries) return { ok: false, error: 'payment_gmail_queries_not_configured' };
  for (var i = 0; i < queries.length; i++) {
    var listed = _paymentListCandidateIds(queries[i], 50);
    if (!listed.ok) return listed;
    if (listed.messageIds.indexOf(messageId) !== -1) return { ok: true, retry: false };
  }
  return { ok: false, error: 'message_outside_candidate_boundary' };
}

function _paymentEnsureLabel() {
  var listed = _paymentGmailFetch('/labels', { method: 'get' });
  if (!listed.ok) return listed;
  var labels = listed.data.labels || [];
  for (var i = 0; i < labels.length; i++) {
    if (labels[i].name === PAYMENT_RECONCILIATION_LABEL) {
      return { ok: true, labelId: labels[i].id };
    }
  }
  var created = _paymentGmailFetch('/labels', {
    method: 'post',
    payload: {
      name: PAYMENT_RECONCILIATION_LABEL,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show',
    },
  });
  if (!created.ok) return created;
  return { ok: true, labelId: created.data.id };
}

function _paymentApplyLabel(messageId) {
  var label = _paymentEnsureLabel();
  if (!label.ok) return label;
  var modified = _paymentGmailFetch('/messages/' + encodeURIComponent(messageId) + '/modify', {
    method: 'post',
    payload: { addLabelIds: [label.labelId], removeLabelIds: [] },
  });
  if (!modified.ok) return modified;
  return { ok: true, messageId: String(messageId), labelId: label.labelId };
}

if (typeof globalThis !== 'undefined') {
  globalThis.scanPaymentGmailCandidates = scanPaymentGmailCandidates;
  globalThis.__kinfusionPaymentGmailBridge = {
    _paymentGetCandidateMessage: _paymentGetCandidateMessage,
    _paymentCandidateBoundary: _paymentCandidateBoundary,
    _paymentEnsureLabel: _paymentEnsureLabel,
    _paymentApplyLabel: _paymentApplyLabel,
  };
}
