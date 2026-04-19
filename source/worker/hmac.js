// ADR R5.5: HMAC-SHA256 over (timestamp, nonce, canonical-body-hash) before forwarding.
// ADR R12.3: APPS_SCRIPT_URL never exposed to clients.
// ADR R12.4: internal error details never surfaced to clients.

async function sha256hex(text) {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256hex(message, key) {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function signAndForward(payload, env) {
  const timestamp = Date.now().toString();
  const nonce = crypto.randomUUID().replace(/-/g, '').slice(0, 16);

  // Canonical body hash: SHA-256 of JSON with keys sorted alphabetically
  const sorted = Object.fromEntries(Object.entries(payload).sort());
  const canonicalBodyHash = await sha256hex(JSON.stringify(sorted));

  const message = `${timestamp}:${nonce}:${canonicalBodyHash}`;
  const signature = await hmacSha256hex(message, env.APPS_SCRIPT_HMAC_KEY);

  // Embed transport fields in body (Apps Script doPost cannot read custom headers)
  const forwardBody = { ...payload, _ts: timestamp, _nonce: nonce, _sig: signature };

  let response;
  try {
    response = await fetch(env.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(forwardBody),
    });
  } catch {
    console.log(JSON.stringify({ ts: Date.now(), reason: 'upstream_unreachable' }));
    return { ok: false, code: 'UPSTREAM_UNREACHABLE' };
  }

  if (!response.ok) {
    console.log(JSON.stringify({ ts: Date.now(), reason: 'upstream_error', status: response.status }));
    return { ok: false, code: 'UPSTREAM_ERROR' };
  }

  let data;
  try {
    data = await response.json();
  } catch {
    return { ok: false, code: 'UPSTREAM_ERROR' };
  }

  return data;
}
