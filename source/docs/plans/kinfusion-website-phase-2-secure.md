# Security Review: kinfusion-website Phase 2

## Scope

Phase 2 implementation: Cloudflare Worker API pipeline (`worker/*.js`), Apps Script gateway and handlers (`apps-script/`), client-side form handler (`src/js/form-handler.js`), and all three form pages.

## Secrets Scan

**Result: Clean.** No hardcoded secrets found. All sensitive values (`TURNSTILE_SECRET`, `APPS_SCRIPT_HMAC_KEY`, `APPS_SCRIPT_URL`, `FORM_TOKEN_SECRET`) are accessed exclusively via `env.*` bindings in the Worker and `PropertiesService.getScriptProperties()` in Apps Script. The `site.json` Turnstile production sitekey is a placeholder (`REPLACE_WITH_REAL_SITEKEY`). No `.env` files committed.

## OWASP Assessment

**Injection:** No SQL or shell injection surface. User input flows through JSON parsing only; canonical body hash is SHA-256, not interpolated into queries. Apps Script writes to Sheets via `appendRow()` with array literals — no injection vector.

**Broken Auth:** Form tokens are single-use (KV delete on validate), HMAC-signed, and expire in 30 min. Turnstile challenge required on every submission. Apps Script validates HMAC, clock skew, and nonce replay. No session state.

**Sensitive Data:** PII (name, email, pronouns) transmitted over HTTPS. Structured logs truncate IP to /24. No PII logged beyond email in Apps Script Logger (acceptable for organizer debugging). Privacy notice on all forms confirms 90-day retention with deletion date.

**Access Control:** No admin endpoints. Apps Script is `ANYONE_ANONYMOUS` but protected by HMAC — only the Worker with the correct `APPS_SCRIPT_HMAC_KEY` can submit valid requests.

**Security Misconfiguration:** CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy all set on every response. No verbose error details exposed to clients (error codes only, no stack traces).

**XSS:** No DOM `innerHTML` usage in production JS. Success messages constructed via `createElement`/`textContent`. CSP restricts scripts to `'self'` + `challenges.cloudflare.com`.

**Insufficient Logging:** Structured JSON logging on all rejection events (honeypot, rate_limited, duplicate, upstream errors). Apps Script logs HMAC mismatches and errors via `Logger.log`.

## Dependency Audit

`npm audit` found **4 high, 6 moderate** vulnerabilities — all in **devDependencies only** (`@cloudflare/vitest-pool-workers` → `devalue`, `undici`, `wrangler`). None are in runtime dependencies. Production Workers bundle does not include devDependencies.

- `devalue`: prototype pollution — affects test tooling only, no runtime exposure
- `undici`: request smuggling, unbounded decompression — affects test HTTP client, not the Worker's `fetch`
- `wrangler`: OS command injection in `pages deploy` — developer tooling only; not invoked in CI or runtime

**Action:** Filed as phase-3 cleanup to upgrade `@cloudflare/vitest-pool-workers` when a patched version is available.

## Threat Model

**Assets:** Applicant PII (name, email, pronouns, dietary/accessibility notes), registration tier, organizer Google Sheet.

**Trust Boundaries:**
1. Public internet → Worker: protected by Turnstile, form token, honeypot, rate limit, field validation
2. Worker → Apps Script: protected by HMAC-SHA256 with 5-min clock skew window and nonce replay cache
3. Apps Script → Google Sheet: protected by Apps Script identity and LockService concurrency control

**Attack Vectors and Mitigations:**

| Vector | Mitigation |
|--------|-----------|
| Bot spam submission | Turnstile (human challenge) + honeypot + rate limit (3/IP/min) |
| Replay attack on Apps Script | Nonce replay cache (10-min CacheService) + 5-min clock skew check |
| Forged HMAC request to Apps Script | 32-byte HMAC key required; not exposed in Worker responses |
| Concurrent duplicate submission | Dedupe hash (10-min KV window) + LockService in Apps Script |
| Form token replay | Single-use (KV delete on validate) |
| Overly long inputs (DoS or injection probe) | Server-side max-length validation on all text fields |
| Invalid enum values (arrivalDay, duration) | Allowlist validation added in security pass |

## Findings

| Severity | Category | Finding | File(s) | Remediation |
|----------|----------|---------|---------|-------------|
| High | Deps (dev-only) | `devalue` prototype pollution, `undici` request smuggling/DoS, `wrangler` command injection — all devDependencies | `package.json` | Accepted: no production exposure. Track upstream fix in `@cloudflare/vitest-pool-workers`. |
| Medium | Key Reuse | Form token HMAC used `APPS_SCRIPT_HMAC_KEY` — same key as inter-service signing | `formToken.js` | **Fixed:** Added `FORM_TOKEN_SECRET` env binding; falls back to `APPS_SCRIPT_HMAC_KEY` if unset. |
| Medium | Input Validation | `arrivalDay` accepted any string | `validation.js` | **Fixed:** Allowlist: `{thursday, friday, saturday}` |
| Medium | Input Validation | `duration` (unconference) accepted any string | `validation.js` | **Fixed:** Allowlist: `{30, 60, 90}` |
| Medium | Input Validation | `setLengthMin` not validated as integer in range | `validation.js` | **Fixed:** Integer parse + range check 15–240 min |
| Low | CORS | No CORS restriction on `/api/*` | `worker/index.js` | Accepted: Turnstile + form token provide adequate protection for this use case. |

## Remediations Applied

1. Added `FORM_TOKEN_SECRET` env binding with fallback — `formToken.js`, `vitest.config.js`, `wrangler.toml`, `CONTRIBUTING.md`
2. Added `arrivalDay` allowlist validation — `validation.js`
3. Added `duration` allowlist validation — `validation.js`
4. Added `setLengthMin` numeric range validation (15–240 min) — `validation.js`

## Remaining Risks

- **Dev dependency vulnerabilities** (devalue, undici, wrangler): accepted, no production surface. Upgrade when `@cloudflare/vitest-pool-workers` releases a patched version.
- **CORS**: not restricted. Risk is low because all submissions require a valid single-use form token + Turnstile challenge. Cross-origin automated abuse is effectively blocked by these controls.
