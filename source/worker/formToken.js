// ADR R4.4, R5.4: POST /api/form-token issues single-use 30-minute tokens.
// Token = "<timestamp>.<nonce>.<hmac>" stored as KV key "ft:<token>" with 30-min TTL.
// On validate: KV key deleted (single-use). Uses crypto.subtle (Web Crypto API).

async function computeHmac(message, key) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function issueToken(env) {
  const timestamp = Date.now().toString();
  const nonce = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const key = env.FORM_TOKEN_SECRET || env.APPS_SCRIPT_HMAC_KEY;
  const hmac = await computeHmac(timestamp + ':' + nonce, key);
  const token = `${timestamp}.${nonce}.${hmac}`;
  await env.RATE_KV.put(`ft:${token}`, '1', { expirationTtl: 1800 });
  return token;
}

export async function validateAndConsumeToken(token, env) {
  if (!token) {
    return { valid: false, code: 'FORM_TOKEN_MISSING' };
  }
  const kvKey = `ft:${token}`;
  const exists = await env.RATE_KV.get(kvKey);
  if (!exists) {
    return { valid: false, code: 'FORM_TOKEN_INVALID' };
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    await env.RATE_KV.delete(kvKey);
    return { valid: false, code: 'FORM_TOKEN_INVALID' };
  }
  const ts = parseInt(parts[0], 10);
  if (Date.now() - ts > 30 * 60 * 1000) {
    await env.RATE_KV.delete(kvKey);
    return { valid: false, code: 'FORM_TOKEN_EXPIRED' };
  }
  await env.RATE_KV.delete(kvKey);
  return { valid: true };
}
