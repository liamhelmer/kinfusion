# Security Review: Kin-Fusion Campout Website — Phase 1

## Scope

Phase 1 changed files reviewed: Worker routing, Eleventy config, base template, GitHub Actions workflows, wrangler.toml, source images. Mode: `--parallel` (star-chamber council review with 2 providers).

## Secrets Scan

CLEAN — no hardcoded credentials or API keys found. KV placeholder IDs in `wrangler.toml` are non-sensitive config values, not secrets. Secrets (`TURNSTILE_SECRET`, `APPS_SCRIPT_URL`, `APPS_SCRIPT_HMAC_KEY`) are deferred to Phase 2 and will be set via `wrangler secret put`.

## OWASP Assessment

| Category | Status | Notes |
| :--- | :--- | :--- |
| Injection | N/A | No user input in Phase 1; Worker only routes static paths |
| Broken Auth | N/A | No auth in Phase 1; all content public |
| Sensitive Data | Clean | No PII collected or stored |
| XSS | Conditional | `{{ content | safe }}` acceptable — all content is author-controlled static files. Must not be copied to Phase 2 form handling |
| Security Misconfiguration | Remediated | Security headers added to Worker (CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy) |
| Broken Access Control | N/A | No authorization in Phase 1 |
| Insecure Deserialization | N/A | No deserialization |
| Vulnerable Components | Clean | `npm audit` reports 0 vulnerabilities across 171 dependencies |
| Insufficient Logging | Accepted | Phase 1 static site; Cloudflare provides access logs at edge |

## Dependency Audit

`npm audit` result: 0 vulnerabilities (0 critical, 0 high, 0 moderate, 0 low) across 171 dependencies.

## Threat Model

**Assets:** Static HTML/CSS/image files; Cloudflare Worker code; CI/CD secrets (CF_API_TOKEN).

**Trust Boundaries:**
- Internet → Cloudflare edge (DDoS protection at edge layer)
- Cloudflare edge → Worker (trusted Cloudflare runtime)
- Worker → ASSETS binding (trusted static files built by Eleventy)
- GitHub Actions → Cloudflare deployment (CF_API_TOKEN scoped to project)

**STRIDE Assessment:**
- **Tampering:** GitHub Actions pinned to `@v4` (major version). SHA pinning would be stronger but is low priority for this project scale. Accepted risk.
- **Information Disclosure:** `/api/*` handler exposes JSON revealing API routing surface. Phase 2 design intent, accepted risk. Council noted it's minor.
- **DoS:** No rate limiting in Phase 1 (RATE_KV placeholder). Cloudflare edge provides DDoS protection. Phase 2 will add Worker-level rate limiting (T-2.0).
- **Spoofing/Repudiation/EoP:** Not applicable to Phase 1 static site.

## Findings

| Severity | Category | Finding | File(s) | Status |
| :--- | :--- | :--- | :--- | :--- |
| Medium | Security Misconfiguration | Missing security headers (CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy) on all responses | `source/worker/index.js` | **Remediated** |
| Medium | Correctness | `engines` field absent from `package.json` — Node 22 requirement for `readdirSync({ recursive: true })` not machine-enforced | `source/package.json` | **Remediated** |
| Low | Information Disclosure | `/api/*` handler returns JSON revealing future API namespace surface | `source/worker/index.js` | Accepted — Phase 2 design intent |
| Low | Supply Chain | GitHub Actions pinned to `@v4` major version, not SHA | `.github/workflows/*.yml` | Accepted — proportionate for project scale |
| Low | Architecture | `src/js` passthrough registered in Eleventy config though no JS exists in Phase 1 | `source/.eleventy.js` | Accepted — placeholder for Phase 2 JS |
| Low | Correctness | Image shortcode has no path traversal validation on `src` parameter | `source/.eleventy.js` | Accepted — author-only trusted input |

## Remediations Applied

1. **Security headers in Worker** — Added `withSecurityHeaders()` helper that clones each response and sets `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` on all static asset responses — commit `fix(security): add response security headers to Worker`
2. **Node engines field** — Added `"engines": { "node": ">=22.0.0" }` to `package.json` to machine-enforce Node 22 requirement — same commit

## Remaining Risks

- **`{{ content | safe }}`** — Safe in Phase 1 (all content author-controlled static files). ADR documents this pattern. Must not be copied to Phase 2 form-response rendering without explicit sanitization review.
- **`/api/*` JSON disclosure** — Minor information disclosure of routing intent. Accepted as Phase 2 API contract stub.
- **GitHub Actions SHA pinning** — Low priority for this project; major version pinning (`@v4`) is proportionate. Revisit if project grows a security-sensitive supply chain.

## Council Feedback

Star-chamber review (2 providers: gemini-3.1-pro, gpt-5.4) — both rated implementation "good". Council consensus: clean Phase 1 architecture with minimal real attack surface. Primary recommendation was security headers in the Worker, which has been applied.
