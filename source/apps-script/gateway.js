/**
 * Apps Script security gateway.
 * Validates HMAC, clock skew, nonce replay, and acquires LockService before dispatching.
 *
 * ADR R6.1: HMAC validation, reject clock skew >5 min, reject replayed nonces within 10 min.
 * ADR R6.2: LockService.getScriptLock() with 10-second timeout wraps all sheet writes.
 *
 * IMPORTANT: Apps Script doPost(e) does NOT expose custom request headers.
 * The Worker (hmac.js) embeds _ts, _nonce, _sig as fields in the JSON body.
 */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var props = PropertiesService.getScriptProperties();
    var hmacKey = props.getProperty('HMAC_KEY');
    var nonceCacheMin = parseInt(props.getProperty('NONCE_CACHE_MIN') || '10', 10);

    if (!hmacKey) {
      return jsonResponse({ ok: false, code: 'MISCONFIGURED' });
    }

    var timestamp = body._ts;
    var nonce = body._nonce;
    var signature = body._sig;

    if (!timestamp || !nonce || !signature) {
      return jsonResponse({ ok: false, code: 'HMAC_MISSING' });
    }

    // Clock skew check — reject if |serverTime - ts| > 5 minutes
    var serverTime = Date.now();
    var requestTime = parseInt(timestamp, 10);
    if (Math.abs(serverTime - requestTime) > 5 * 60 * 1000) {
      return jsonResponse({ ok: false, code: 'CLOCK_SKEW' });
    }

    // Build canonical payload (exclude transport fields _ts, _nonce, _sig)
    var payloadFields = {};
    Object.keys(body).forEach(function(k) {
      if (k !== '_ts' && k !== '_nonce' && k !== '_sig') {
        payloadFields[k] = body[k];
      }
    });

    // Canonical body hash: SHA-256 of JSON with keys sorted alphabetically
    var sortedKeys = Object.keys(payloadFields).sort();
    var sortedObj = {};
    sortedKeys.forEach(function(k) { sortedObj[k] = payloadFields[k]; });
    var sortedJson = JSON.stringify(sortedObj);

    var hashBytes = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      sortedJson,
      Utilities.Charset.UTF_8
    );
    var canonicalBodyHash = hashBytes
      .map(function(b) { return (b < 0 ? b + 256 : b).toString(16).padStart(2, '0'); })
      .join('');

    // HMAC-SHA256 validation
    var message = timestamp + ':' + nonce + ':' + canonicalBodyHash;
    var expectedSigBytes = Utilities.computeHmacSha256Signature(
      message, hmacKey, Utilities.Charset.UTF_8
    );
    var expectedSig = expectedSigBytes
      .map(function(b) { return (b < 0 ? b + 256 : b).toString(16).padStart(2, '0'); })
      .join('');

    if (expectedSig !== signature) {
      Logger.log('HMAC mismatch for nonce: ' + nonce);
      return jsonResponse({ ok: false, code: 'HMAC_INVALID' });
    }

    // Nonce replay check (CacheService, 10-minute TTL)
    var cache = CacheService.getScriptCache();
    var nonceKey = 'nonce:' + nonce;
    if (cache.get(nonceKey)) {
      return jsonResponse({ ok: false, code: 'REPLAY' });
    }
    cache.put(nonceKey, '1', nonceCacheMin * 60);

    // Acquire script lock (10-second timeout)
    var lock = LockService.getScriptLock();
    var lockAcquired = false;
    try {
      lock.waitLock(10000);
      lockAcquired = true;
    } catch (lockErr) {
      return jsonResponse({ ok: false, code: 'BUSY' });
    }

    try {
      var result = dispatchForm(body.form, payloadFields);
      return jsonResponse(result);
    } finally {
      if (lockAcquired) {
        lock.releaseLock();
      }
    }
  } catch (err) {
    Logger.log('gateway error: ' + err.message + '\n' + (err.stack || ''));
    return jsonResponse({ ok: false, code: 'INTERNAL_ERROR' });
  }
}

function dispatchForm(form, payload) {
  switch (form) {
    case 'register':     return handleRegister(payload);
    case 'unconference': return handleUnconference(payload);
    case 'dj-signup':    return handleDJSignup(payload);
    default:             return { ok: false, code: 'UNKNOWN_FORM' };
  }
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
