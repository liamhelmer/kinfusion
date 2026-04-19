// ADR R5.2 (honeypot), R5.3 (rate-limit), R5.6 (dedupe), R5.10 (structured logging).

async function sha256hex(text) {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getIp(request) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  // Truncate to /24 for logging (avoid full PII in logs per R5.10)
  const parts = ip.split('.');
  return parts.length === 4 ? parts.slice(0, 3).join('.') + '.x' : ip.slice(0, 8);
}

// Returns null to continue, or a Response to short-circuit.
export async function applyMiddleware(request, body, formName, env) {
  const ip = getIp(request);

  // Layer 1: Honeypot (ADR R5.2)
  if (body.website && body.website.length > 0) {
    console.log(JSON.stringify({ ts: Date.now(), form: formName, reason: 'honeypot', ip }));
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Layer 2: IP rate limit — 3 per IP per form per 60s (ADR R5.3)
  const minute = Math.floor(Date.now() / 60000);
  const rlKey = `rl:${ip}:${formName}:${minute}`;
  const countStr = await env.RATE_KV.get(rlKey);
  const count = countStr ? parseInt(countStr, 10) : 0;
  if (count >= 3) {
    console.log(JSON.stringify({ ts: Date.now(), form: formName, reason: 'rate_limited', ip }));
    return new Response(JSON.stringify({ ok: false, error: 'Too many requests', code: 'RATE_LIMITED' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  await env.RATE_KV.put(rlKey, String(count + 1), { expirationTtl: 60 });

  // Layer 3: Idempotency dedupe (ADR R5.6): SHA256(form|email_lower|canonicalBodyHash)
  const { formToken, 'cf-turnstile-response': _turnstile, website: _hp, ...payloadFields } = body;
  const sortedPayload = Object.fromEntries(Object.entries(payloadFields).sort());
  const canonicalBodyHash = await sha256hex(JSON.stringify(sortedPayload));
  const emailLower = (body.email || '').toLowerCase();
  const dedupeHash = await sha256hex(`${formName}|${emailLower}|${canonicalBodyHash}`);
  const dedupeKey = `dd:${dedupeHash}`;
  const isDupe = await env.RATE_KV.get(dedupeKey);
  if (isDupe) {
    console.log(JSON.stringify({ ts: Date.now(), form: formName, reason: 'duplicate' }));
    return new Response(JSON.stringify({
      ok: true,
      message: 'We already received this submission. Check your email for a confirmation.',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  await env.RATE_KV.put(dedupeKey, '1', { expirationTtl: 600 });

  return null;
}
