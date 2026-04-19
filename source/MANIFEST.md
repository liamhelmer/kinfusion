# Agent & Module Manifest

**Purpose:** Single source of truth for all coding agents. Records existing agents, modules, and external integrations to prevent duplication of effort and maintain architectural consistency.  
**Rule:** Agents MUST update this registry whenever a new reusable module, agent role, or external facade is created.

---

## 1. Active Agent Teams & Roles

| Agent Name | Primary Role | Trigger Condition | Capabilities / Scopes |
| :--- | :--- | :--- | :--- |
| `Phase-1 Teammate` | Scaffold Eleventy site, image pipeline, CI | Phase 1 of BRAINS kinfusion-website pipeline | Read/Write `source/`, `assets/`, `.github/` |
| `Grooming Subagent` | Expand beads tasks with implementation notes | T2 grooming in teammate protocol | Read beads, codebase, docs |
| `Troubleshooter` | Diagnose build/pipeline failures | Non-zero exit codes, build failures | Read-only logs and codebase |

---

## 2. Module & Function Registry

| Module / Function | File Path | Description | Dependencies | Idempotent |
| :--- | :--- | :--- | :--- | :--- |
| `imageShortcode` | `source/.eleventy.js` | Async Nunjucks+Liquid shortcode: generates AVIF/WebP/JPEG at 480/960/1440/1920px. Supports `{ hero: true }` for fetchpriority+eager loading. | `@11ty/eleventy-img` | Y |
| `12 MB image guard` | `source/.eleventy.js` (eleventy.before hook) | Recursively scans `src/assets/` for files > 12 MB; throws to fail the build. | `fs`, `path` | Y |
| Worker fetch handler | `source/worker/index.js` | Routes `POST /api/form-token`, `/api/register`, `/api/unconference`, `/api/dj-signup`. Full pipeline: token→Turnstile→validate→middleware→HMAC forward. | headers, formToken, turnstile, validation, middleware, hmac | Y |
| `addSecurityHeaders` | `source/worker/headers.js` | Clones a Response and adds R5.8 security headers (CSP, HSTS, X-Frame-Options, etc.) | — | Y |
| `issueToken` / `validateAndConsumeToken` | `source/worker/formToken.js` | Issue and single-use-consume HMAC-signed form tokens stored in RATE_KV with 30-min TTL | Workers KV, Web Crypto | Y |
| `verifyTurnstile` | `source/worker/turnstile.js` | Calls Cloudflare siteverify to validate Turnstile widget tokens | `TURNSTILE_SECRET` env binding | Y |
| `applyMiddleware` | `source/worker/middleware.js` | Honeypot (200 fake), rate limit (3/IP/min → 429), dedupe (10-min SHA256 window → 200) | Workers KV, Web Crypto | Y |
| `validateRegistration` / `validateUnconference` / `validateDJ` | `source/worker/validation.js` | Server-side field validation per R7.3 for all three form endpoints | — | Y |
| `signAndForward` | `source/worker/hmac.js` | HMAC-SHA256 signs payload (ts:nonce:bodyHash), embeds `_ts/_nonce/_sig` as body fields, POSTs to Apps Script | `APPS_SCRIPT_HMAC_KEY`, `APPS_SCRIPT_URL` | Y |
| `initForm` | `source/src/js/form-handler.js` | Shared browser form handler: fetches form token, registers Turnstile callback, 5s timeout fallback, submits JSON, maps server error codes to user messages | Browser Fetch API | Y |
| Registration form init | `source/src/js/register.js` | Page-level script: selects `#registration-form` and calls `initForm` with register config | `form-handler.js` | Y |
| Unconference form init | `source/src/js/unconference.js` | Page-level script: selects `#unconference-form` and calls `initForm` with unconference config | `form-handler.js` | Y |
| DJ form init | `source/src/js/dj.js` | Page-level script: selects `#dj-form` and calls `initForm` with dj-signup config | `form-handler.js` | Y |
| Apps Script `doPost` gateway | `source/apps-script/gateway.js` | Verifies clock skew, HMAC signature, nonce replay, dispatches to form handlers | Apps Script LockService, CacheService, PropertiesService | Y |
| `generateRefCode` / email builders | `source/apps-script/handlers/shared.js` | Shared helpers: generates `KF-XXXXX` refCode (collision-safe RNG), builds HTML confirmation email bodies for all three form types | — | Y |
| `handleRegister` | `source/apps-script/handlers/register.js` | Appends 20-column row to Google Sheet, sends confirmation email with refCode | GmailApp, SpreadsheetApp, shared.js | Y |
| `handleUnconference` | `source/apps-script/handlers/unconference.js` | Appends unconference proposal row, sends confirmation email | GmailApp, SpreadsheetApp, shared.js | Y |
| `handleDJSignup` | `source/apps-script/handlers/dj.js` | Appends DJ signup row, sends confirmation email | GmailApp, SpreadsheetApp, shared.js | Y |
| `runWeeklyBackup` / `installBackupTrigger` | `source/apps-script/backup.js` | Exports operational Sheet as XLSX to Drive weekly (Sunday midnight). Idempotent — skips if today's backup exists. | DriveApp, UrlFetchApp, ScriptApp | Y |
| `runRetentionCheck` / `installRetentionTrigger` | `source/apps-script/retention.js` | Daily trigger: no-op before 2026-12-12; on/after archives aggregate counts to KinFusion-2026-Archive tab, deletes PII rows, notifies organizer. | SpreadsheetApp, GmailApp, ScriptApp | Y |
| smoke-test-register.sh | `source/scripts/smoke-test-register.sh` | Bash script for T-2.9 first-form smoke test against the staging preview Worker. Sends a `curl` POST and validates the JSON response contains a refCode. | `curl`, `jq` | Y |

---

## 3. External Integrations (Facades)

| Facade Name | File Path | Wrapped Library/API | Purpose |
| :--- | :--- | :--- | :--- |
| Eleventy Image | `source/.eleventy.js` | `@11ty/eleventy-img@6.0.0` | Responsive image generation with AVIF/WebP/JPEG output |
| Cloudflare ASSETS | `source/worker/index.js` | `env.ASSETS.fetch()` | Static asset serving via Cloudflare Workers Static Assets binding |
| GitHub Actions CI | `.github/workflows/preview.yml`, `production.yml` | GitHub Actions + Wrangler 4 | Preview deploy on non-main branches; production deploy on main |
| axe-core CLI | `.github/workflows/preview.yml` | `@axe-core/cli@^4` | WCAG 2.2 AA accessibility audit on every PR against locally-served build |
| Lighthouse CI | `.github/workflows/preview.yml`, `source/lighthouserc.json` | `@lhci/cli@^0.15` | Mobile Lighthouse scores — fails on perf <85 / a11y <95 per ADR R10.2 |
| Playwright | `source/e2e/`, `source/playwright.config.js` | `@playwright/test@^1.50` | E2E tests for all three forms; golden path, duplicate, rate-limit. Run via PLAYWRIGHT_BASE_URL |

---

## 4. Global State & Conventions

- **Build output:** `source/_site/` (gitignored)
- **Source images:** `source/src/assets/` (all JPG/PNG, none > 12 MB)
- **Image variants:** `source/_site/img/` (generated at build time, gitignored)
- **Node version:** 22 (pinned in `.nvmrc`)
- **Package manager:** npm with lockfile committed (`source/package-lock.json`)
- **Eleventy version:** 3.1.5 (pinned, frozen post-2026-08-01 per ADR R2.1)
- **eleventy-img version:** 6.0.0 (pinned)
- **Wrangler version:** 4.x (installed globally)
- **Template engine:** Nunjucks (`.njk`) for all pages; Liquid available for `.md` files
- **CSS:** Plain CSS with nesting, no preprocessor, `source/src/css/main.css`
- **KV namespace:** `RATE_KV` — placeholder IDs in Phase 1; real IDs set in Phase 2 (T-2.0)
- **Secrets (Phase 2):** `TURNSTILE_SECRET`, `APPS_SCRIPT_URL`, `APPS_SCRIPT_HMAC_KEY` via `wrangler secret put`
