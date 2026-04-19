// ADR R5.1: Turnstile siteverify verification before processing any form submission.

export async function verifyTurnstile(token, env) {
  if (!token) {
    return { success: false, code: 'TURNSTILE_MISSING' };
  }
  const formData = new FormData();
  formData.append('secret', env.TURNSTILE_SECRET);
  formData.append('response', token);
  let data;
  try {
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });
    data = await resp.json();
  } catch {
    return { success: false, code: 'TURNSTILE_UNREACHABLE' };
  }
  if (!data.success) {
    return { success: false, code: 'TURNSTILE_INVALID' };
  }
  return { success: true };
}
