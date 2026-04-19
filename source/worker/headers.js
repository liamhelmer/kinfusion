// ADR R5.8: security headers for all Worker responses.
// CSP allowlists challenges.cloudflare.com for Turnstile widget (R5.8 note).

export function addSecurityHeaders(response) {
  const cloned = new Response(response.body, response);
  const csp = [
    "default-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "img-src 'self' data:",
    "style-src 'self'",
    "connect-src 'self'",
  ].join('; ');

  cloned.headers.set('Content-Security-Policy', csp);
  cloned.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  cloned.headers.set('X-Content-Type-Options', 'nosniff');
  cloned.headers.set('X-Frame-Options', 'DENY');
  cloned.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  cloned.headers.set('Permissions-Policy', 'interest-cohort=()');
  return cloned;
}
