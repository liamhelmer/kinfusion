# Plan: Kin-Fusion Campout Website

**Slug:** kinfusion-website
**ADRs:** docs/adr/2026-04-18-001-kinfusion-website-architecture.md
**Research:** docs/plans/2026-04-18-kinfusion-website-research.md
**Mode:** --parallel
**Autopilot:** true
**Lean:** false
**Branch:** brains/kinfusion-website

---

## Summary

Three phases, 31 implementation tasks total (revised after star-chamber review integrated 8 findings: ADR R4.4 form-token method, infrastructure bootstrap, staging-first ordering, Apps Script task split, shared form-module extraction, retention-implementation gap, production-deploy parity per R1.2, server-side length validation per R7.3). Phase 1 (10 tasks) scaffolds the Eleventy 3.1 project, wrangler.toml, base templates, all 8 content pages, the image pipeline (including HEIC pre-conversion), CSS, and a deploy to a Cloudflare preview URL with production workflow scaffolded behind a branch gate — verifiable by visiting the URL in a browser. Phase 2 (15 tasks) builds the full backend path: environment bootstrap (KV namespace, Turnstile provisioning, secret placeholders); staging Google Sheet and Apps Script; Worker routes with POST form-token; Turnstile + honeypot + rate-limit + server-side length validation + dedupe middleware; HMAC forward; Apps Script security gateway (HMAC/replay/LockService) split from business handlers (row append, refCode, email); shared client form-module + three forms; end-to-end golden-path smoke against staging. Phase 3 (6 tasks) hardens and ships: accessibility CI, Lighthouse CI, Playwright E2E, security-header + no-payment-data audit, runbook + weekly backup + retention-implementation trigger, DNS cutover + production sheet/Apps-Script creation + launch drill. The critical path runs linearly through the phases.

---

## Phase 1 — Scaffold + Static Site Core

**Deliverable:** An Eleventy 3.1 static site with all 8 content pages, image pipeline, CSS, and a live Cloudflare Worker + Static Assets preview URL.

**Testable via:** Navigate the preview URL in a browser. All 8 pages load, images render (AVIF/WebP/JPEG), navigation works, no JavaScript errors on content pages, Lighthouse CLI reports performance ≥ 85 on the home page.

**Pre-requisites:** None — this is the foundation phase.

#### Tasks

- [ ] **T-1.1** HEIC pre-conversion and asset ingest — Convert the two HEIC source files (`IMG_6605.HEIC`, `sunset.HEIC`) to JPEG locally using `sips` (macOS) or `heif-convert` (Linux). Move all 10 assets to `source/src/assets/`. Add a `CONTRIBUTING.md` section documenting the conversion command and the 12 MB size guard.
  - **Acceptance:**
    - `src/assets/` contains 10 files, all JPG or PNG, none > 12 MB
    - No `.HEIC` files are present in the repo
    - `CONTRIBUTING.md` documents the one-time conversion workflow
  - **Depends on:** none
  - **Artifacts:** `source/src/assets/` (10 image files), `source/CONTRIBUTING.md`
  - **Risk:** medium — manual step; easy to skip on a new machine or when adding future photos

- [ ] **T-1.2** Repository scaffold and Eleventy init — Initialise `package.json` with pinned Eleventy 3.1.x and `@11ty/eleventy-img` 6.x. Commit `package-lock.json`. Create `source/.eleventy.js` (ESM), configure input `src/`, output `_site/`. Add `.nvmrc` pinned to Node 22. Add `.gitignore` covering `_site/`, `node_modules/`, `.env.local`.
  - **Acceptance:**
    - `npm run build` produces a `_site/` directory without errors
    - `package-lock.json` is committed and `node_modules/` is gitignored
    - `.nvmrc` reads `22`
  - **Depends on:** none
  - **Artifacts:** `source/package.json`, `source/package-lock.json`, `source/.eleventy.js`, `source/.nvmrc`, `source/.gitignore`
  - **Risk:** low

- [ ] **T-1.3** Wrangler project setup — Create `source/wrangler.toml` defining the Workers + Static Assets project: static assets directory pointing at `_site/`, Worker entry at `source/worker/index.js`, KV namespace binding (`RATE_KV`) with a placeholder namespace ID for local dev. Add a `build` command in `wrangler.toml` that runs `npm run build` before deploy. Document the `wrangler deploy` workflow in `CONTRIBUTING.md`.
  - **Acceptance:**
    - `wrangler dev` starts without errors and serves `_site/` over localhost
    - `wrangler.toml` references a KV namespace binding named `RATE_KV`
    - Worker entry file exists and passes requests for non-`/api/*` paths to static assets
  - **Depends on:** T-1.2
  - **Artifacts:** `source/wrangler.toml`, `source/worker/index.js`
  - **Risk:** low

- [ ] **T-1.4** Base Nunjucks templates — Create `src/_includes/base.njk` (HTML5 shell with `<head>`, `<body>`, skip-nav link, and block slots for `title`, `head`, `content`), `src/_includes/nav.njk` (site nav with all 8 page links), and `src/_includes/footer.njk` (copyright, `hello@kinfusion.dance` contact link). Wire them into a layout chain.
  - **Acceptance:**
    - Every page built from the base layout includes nav and footer
    - Skip-navigation link is the first focusable element in the DOM
    - `<html lang="en">` and a unique `<title>` per page are present
  - **Depends on:** T-1.2
  - **Artifacts:** `source/src/_includes/base.njk`, `source/src/_includes/nav.njk`, `source/src/_includes/footer.njk`
  - **Risk:** low

- [ ] **T-1.5** Content pages in Markdown — Create the 8 Markdown content pages: `index.md`, `about/index.md`, `location/index.md`, `schedule/index.md`, `register/index.md`, `unconference/index.md`, `dj/index.md`, `faq/index.md`. Each page gets front-matter (`title`, `layout`, `description`) and placeholder body copy. The three form pages (`register`, `unconference`, `dj`) contain a `<noscript>` fallback pointing to `mailto:hello@kinfusion.dance`.
  - **Acceptance:**
    - `npm run build` produces `/`, `/about/`, `/location/`, `/schedule/`, `/register/`, `/unconference/`, `/dj/`, `/faq/` as static HTML
    - Non-form pages emit zero `<script>` tags
    - Each page has a `<meta name="description">` tag populated from front-matter
  - **Depends on:** T-1.4
  - **Artifacts:** `source/src/*.md` and `source/src/*/index.md` (8 files)
  - **Risk:** low

- [ ] **T-1.6** Image pipeline shortcode — Register an `image` Nunjucks shortcode in `.eleventy.js` backed by `@11ty/eleventy-img`. The shortcode generates AVIF, WebP, and JPEG variants at widths 480, 960, 1440, 1920 px and emits a `<picture>` element with srcset. Add a build-time guard that throws if any source file in `src/assets/` is > 12 MB. Document LCP hero vs lazy usage in `CONTRIBUTING.md`.
  - **Acceptance:**
    - Running `npm run build` produces multi-format variants in `_site/img/`
    - Generated `<picture>` elements contain `<source type="image/avif">`, `<source type="image/webp">`, and an `<img>` fallback
    - Build exits non-zero if a source image exceeds 12 MB (verified with a test file)
    - Hero image on the home page has `fetchpriority="high"`; all others have `loading="lazy" decoding="async"`
  - **Depends on:** T-1.1, T-1.2
  - **Artifacts:** `source/.eleventy.js` (modified), `source/src/assets/` (images in place)
  - **Risk:** low

- [ ] **T-1.7** Home page hero and photo placement — Integrate the 10 source images across pages per the ADR R3.6 consent/placement guidance: landscape/venue shots for hero and above-the-fold; human-identifiable shots on inner pages at low prominence. Wire the hero image with the `image` shortcode, `fetchpriority="high"`. Apply initial alt text to all images.
  - **Acceptance:**
    - Home page hero renders an AVIF/WebP/JPEG `<picture>` with `fetchpriority="high"` on the `<img>`
    - All 10 images are placed on at least one page with meaningful `alt` text
    - Home page total asset weight (HTML + CSS + LCP AVIF) is under 500 KB (verified with `wrangler dev` + browser DevTools)
  - **Depends on:** T-1.5, T-1.6
  - **Artifacts:** `source/src/index.md` (modified), various page Markdown files (modified)
  - **Risk:** low

- [ ] **T-1.8** CSS and design system — Create `src/css/main.css`. Style: custom properties for brand colours (derived from the KinFusion banner asset), base typography (system font stack), responsive nav, hero layout, form page shell (placeholder — form elements styled in Phase 2), and utility classes. Load via a `<link>` in `base.njk`. No CSS preprocessor; plain CSS with nesting (baseline 2024+).
  - **Acceptance:**
    - All 8 pages are visually coherent at 375 px and 1280 px viewport widths
    - Colour contrast passes WCAG 2.2 AA (4.5:1 body text, 3:1 large text) — verified with browser a11y devtools
    - No JavaScript shipped on content pages (confirmed via `wrangler dev` network tab)
  - **Depends on:** T-1.4
  - **Artifacts:** `source/src/css/main.css`
  - **Risk:** low

- [ ] **T-1.9** CI workflow for preview AND production deploy — Create `.github/workflows/preview.yml` (triggered by push to any non-`main` branch; deploys to `wrangler deploy --env preview`) and `.github/workflows/production.yml` (triggered by push to `main` only; deploys to `wrangler deploy --env production`). Both run `npm ci` and `npm run build`. Production workflow includes a `concurrency` group to cancel in-flight deploys and requires a reviewer via GitHub branch protection (documented in runbook). Pin Node 22 in both runners. Store `CF_API_TOKEN` and `CF_ACCOUNT_ID` as GitHub Actions secrets. Production workflow exists but is gated — it won't have a production Cloudflare project bound until T-3.6, so intermediate runs will skip actual deploy with a clear log.
  - **Acceptance:**
    - A push to `brains/kinfusion-website` triggers `preview.yml` and produces a working preview URL
    - A push to `main` triggers `production.yml` (it may skip deploy safely until T-3.6)
    - Both workflows fail if `npm run build` fails
    - No secrets appear in workflow logs
    - Branch-protection requirement for `main` is documented in runbook
  - **Depends on:** T-1.3
  - **Artifacts:** `.github/workflows/preview.yml`, `.github/workflows/production.yml`
  - **Risk:** low (implements R1.2 main-branch deploy from Phase 1 rather than deferring to T-3.6)

- [ ] **T-1.10** Phase 1 smoke verification — Manually walk the preview URL: all 8 pages load, images are served as AVIF (verified in DevTools), nav links are correct, no 404s, no console errors. Run `npx lighthouse <preview-url> --only-categories=performance,accessibility --output=json` and confirm performance ≥ 85 and accessibility ≥ 90 on the home page.
  - **Acceptance:**
    - All 8 routes return HTTP 200
    - LCP image is served as AVIF in a supporting browser
    - Lighthouse performance ≥ 85, accessibility ≥ 90 on home page
    - Zero JavaScript on non-form pages confirmed in DevTools
  - **Depends on:** T-1.7, T-1.8, T-1.9
  - **Artifacts:** none (verification task; results documented in commit message or PR comment)
  - **Risk:** low

*Nurture and Secure umbrella tasks for Phase 1 will be created by the orchestrator (dependency updates, secret hygiene review).*

---

## Phase 2 — Worker + Form Backend

**Pre-requisites from Phase 1:** A deployable Cloudflare Worker serving static assets, `wrangler.toml` with KV binding, and the three form page shells (`/register/`, `/unconference/`, `/dj/`) in place.

**Deliverable:** All three forms are fully functional end-to-end: browser submits → Worker validates → Apps Script writes sheet row and sends confirmation email → browser shows refCode.

**Testable via:** Submit a test registration through the staging form, confirm the row appears in the staging Google Sheet, and confirm a confirmation email arrives in the organizer inbox within 30 seconds. Repeat for unconference and DJ signup forms.

#### Tasks

- [ ] **T-2.0** Environment bootstrap — Provision Cloudflare infrastructure prerequisites BEFORE any backend coding: (a) create the `RATE_KV` KV namespace in Cloudflare dashboard and record its ID in `wrangler.toml`; (b) create the Turnstile widget with the site's future domain and the preview `*.workers.dev` origin; record the sitekey as a public config and `wrangler secret put TURNSTILE_SECRET`; (c) generate a 32-byte random `APPS_SCRIPT_HMAC_KEY` (e.g., `openssl rand -hex 32`), run `wrangler secret put APPS_SCRIPT_HMAC_KEY`; (d) add placeholder `APPS_SCRIPT_URL` secret (real value set in T-2.1). Document every command in `CONTRIBUTING.md` under "Environment setup".
  - **Acceptance:**
    - `wrangler kv:namespace list` shows `RATE_KV` with an ID matching `wrangler.toml`
    - Turnstile sitekey is committed to `src/_data/site.json` (or similar); secret is set via `wrangler secret`
    - `wrangler secret list` shows `TURNSTILE_SECRET`, `APPS_SCRIPT_URL`, `APPS_SCRIPT_HMAC_KEY` all present (values hidden)
    - CONTRIBUTING.md "Environment setup" section documents each step
  - **Depends on:** T-1.3
  - **Artifacts:** `source/wrangler.toml` (KV namespace ID filled in), `source/src/_data/site.json` (Turnstile sitekey), `source/CONTRIBUTING.md` (modified)
  - **Risk:** high — hidden blocker that bites mid-backend-coding if skipped; explicit first task in Phase 2 removes the risk

- [ ] **T-2.1** Staging Google Sheet and Apps Script project bootstrap — Create the **staging** Google Sheet (suffixed `-staging` in the name) with three tabs: `Registrations`, `UnconferenceProposals`, `DJSignups`. Add all R7.2 columns to `Registrations` (and equivalent minimal schemas to the other two tabs). Set `status = pending-review` and `paymentStatus = unpaid` as default values. Initialise a clasp project under `source/apps-script/`; configure `.clasp.json` pointing to the staging sheet-bound script. Add `apps-script/.clasp.json` to `.gitignore` (per-developer IDs); source `.gs`/`.ts` files ARE versioned. Commit the `appsscript.json` manifest. Production Sheet and Apps Script are created later in T-3.6. Update `wrangler.toml` `[env.preview]` to point `APPS_SCRIPT_URL` at the staging deployed Web App URL.
  - **Acceptance:**
    - Staging Sheet exists (name ends with `-staging`) with three tabs and correct column headers
    - `clasp push` from `source/apps-script/` succeeds; the script is bound to the staging sheet
    - `apps-script/` source files are committed; `.clasp.json` is gitignored
    - `wrangler.toml` `[env.preview]` section includes `APPS_SCRIPT_URL` pointing to staging
  - **Depends on:** T-2.0
  - **Artifacts:** `source/apps-script/Code.js`, `source/apps-script/appsscript.json`, `source/apps-script/.clasp.json` (gitignored), staging Google Sheet, `source/wrangler.toml` (modified)
  - **Risk:** medium — clasp first-time OAuth setup has real friction; document the `clasp login` flow in `CONTRIBUTING.md`

- [ ] **T-2.2** Worker route skeleton — Add four routes to `worker/index.js`: `POST /api/register`, `POST /api/unconference`, `POST /api/dj-signup`, and **`POST /api/form-token`** (per ADR R4.4 — NOT GET, to avoid edge/browser caching of single-use tokens). Each route returns a stub `{ ok: true }` JSON response for now. Add `Content-Security-Policy` and other R5.8 security headers to all responses via a shared `addSecurityHeaders()` helper. Confirm the Worker still passes static assets through for all non-`/api/*` paths.
  - **Acceptance:**
    - `curl -X POST https://<preview>/api/register` returns `{"ok":true}` with HTTP 200
    - All four `/api/*` routes are reachable
    - Every response (including static asset responses) carries the R5.8 security headers
    - Static pages still load correctly
  - **Depends on:** T-1.3
  - **Artifacts:** `source/worker/index.js` (modified), `source/worker/headers.js`
  - **Risk:** medium — CSP `challenges.cloudflare.com` allowlist must be correct before Turnstile is wired; test this before T-2.5

- [ ] **T-2.3** Worker unit test harness — Set up vitest + miniflare (or `wrangler dev --test` mode) for Worker unit testing. Write an initial test that confirms the security headers are present on `/api/register` responses. Establish the test file structure under `source/worker/tests/`.
  - **Acceptance:**
    - `npm test` runs the Worker test suite and passes
    - At least one test confirms security header presence
    - Test command is documented in `package.json` scripts
  - **Depends on:** T-2.2
  - **Artifacts:** `source/worker/tests/headers.test.js`, `source/vitest.config.js` (or equivalent)
  - **Risk:** low

- [ ] **T-2.4** Form-token issuance and validation — Implement **`POST /api/form-token`** (per ADR R4.4): the Worker generates a signed token (timestamp + nonce + HMAC) stored as a KV key with a 30-minute TTL, and returns it in the response body. Implement token validation middleware that rejects missing, expired, or already-consumed tokens. Write unit tests covering: valid token accepted, expired token rejected, replayed token rejected.
  - **Acceptance:**
    - `POST /api/form-token` (no body) returns a token string
    - A POST form-submission with that token is accepted once; a second submission with the same token is rejected
    - Token older than 30 minutes is rejected
    - Unit tests cover all three cases and pass
  - **Depends on:** T-2.2, T-2.3
  - **Artifacts:** `source/worker/formToken.js`, `source/worker/tests/formToken.test.js`
  - **Risk:** low

- [ ] **T-2.5** Turnstile integration in Worker — Wire Cloudflare Turnstile verification into the Worker request pipeline: extract the `cf-turnstile-response` token from the POST body, POST to `https://challenges.cloudflare.com/turnstile/v0/siteverify` with `TURNSTILE_SECRET`, reject on failure. Write unit tests mocking the siteverify endpoint for pass and fail cases. Confirm the CSP `challenges.cloudflare.com` allowlist does not break the widget in the browser.
  - **Acceptance:**
    - A submission without a Turnstile token returns `{ ok: false, code: "TURNSTILE_MISSING" }`
    - A submission with a mocked invalid token returns `{ ok: false, code: "TURNSTILE_INVALID" }`
    - Unit tests for both cases pass
    - `TURNSTILE_SECRET` is set via `wrangler secret put` and does not appear in any source file
  - **Depends on:** T-2.4
  - **Artifacts:** `source/worker/turnstile.js`, `source/worker/tests/turnstile.test.js`
  - **Risk:** medium — Turnstile + CSP interaction: a too-strict CSP silently breaks the widget; validate in a real browser, not just unit tests

- [ ] **T-2.6** Honeypot, rate-limit, dedupe, AND server-side length validation middleware — Add to the Worker request pipeline: (a) honeypot field rejection (non-empty field → silent HTTP 200 success), (b) IP rate-limit via KV (3 submissions per IP per 60 s per form), (c) dedupe key check (`SHA256(form||email_lower||canonical-body-hash)`, 10-minute KV TTL), (d) **server-side max-length validation per ADR R7.3** — names ≤100 chars, notes (dietary, accessibility, scholarship, description) ≤500 chars, `howDidYouHear` ≤200 chars, email RFC-5322-ish via a conservative regex, tier ∈ {300, 350, 400}, kids counts 0-5, booleans strictly true/false. Reject over-length or malformed payloads with `{ ok: false, code: "VALIDATION", field: "<name>" }`. Write unit tests covering honeypot rejection, rate-limit exhaustion, duplicate submission, and each validation-rejection category.
  - **Acceptance:**
    - Honeypot-filled submission returns HTTP 200 with a generic success body (not a 4xx)
    - Fourth submission from the same IP within 60 s returns `{ ok: false, code: "RATE_LIMITED" }`
    - Duplicate submission within 10 minutes returns `{ ok: false, code: "DUPLICATE" }` with a "we already received this" message
    - Submission with a 501-char `dietaryNotes` is rejected with `{ ok: false, code: "VALIDATION", field: "dietaryNotes" }`
    - Submission with `tier: "500"` is rejected with `{ ok: false, code: "VALIDATION", field: "tier" }`
    - Submission with `codeOfConductAccepted: false` is rejected with `{ ok: false, code: "VALIDATION", field: "codeOfConductAccepted" }`
    - All unit test cases pass
    - Every rejection logs a structured JSON event to `console.log`
  - **Depends on:** T-2.4
  - **Artifacts:** `source/worker/middleware.js`, `source/worker/validation.js`, `source/worker/tests/middleware.test.js`, `source/worker/tests/validation.test.js`
  - **Risk:** low (closes ADR R7.3 gap)

- [ ] **T-2.7** HMAC signing and Worker → Apps Script forward — Implement `HMAC-SHA256` signing over `(timestamp, nonce, canonical-body-hash)` using `APPS_SCRIPT_HMAC_KEY`. POST the signed payload to `APPS_SCRIPT_URL`. Handle Apps Script error responses and map them to Worker error codes. Return `{ ok: true, refCode }` on success. Write unit tests for HMAC signature construction and error mapping.
  - **Acceptance:**
    - Worker generates a valid HMAC header on every forwarded request
    - A tampered payload is rejected by Apps Script HMAC check (tested against staging)
    - `APPS_SCRIPT_URL` and `APPS_SCRIPT_HMAC_KEY` are set via `wrangler secret put`; neither appears in source
    - Unit tests for HMAC construction pass
  - **Depends on:** T-2.5, T-2.6, T-2.1
  - **Artifacts:** `source/worker/hmac.js`, `source/worker/tests/hmac.test.js`, `source/worker/index.js` (modified)
  - **Risk:** low

- [ ] **T-2.8a** Apps Script security gateway — Implement the Apps Script `doPost(e)` entry point that handles *only* request admission: (a) parse JSON body; (b) validate HMAC-SHA256 over `(timestamp, nonce, canonical-body-hash)` against `HMAC_KEY` from Script Properties; (c) reject if `abs(serverTime - ts) > 5 minutes` with `{ ok: false, code: "CLOCK_SKEW" }`; (d) check nonce against `CacheService` (10-minute TTL); reject if previously seen with `{ ok: false, code: "REPLAY" }`; store nonce on accept; (e) acquire `LockService.getScriptLock()` with 10-second timeout; return `{ ok: false, code: "BUSY" }` on timeout; (f) dispatch to the handler function keyed on payload `form`. Stub handlers in this task return `{ ok: true, refCode: "KF-TEST0" }` — business logic comes in T-2.8b. Write Apps Script unit tests (`gas-testing` or similar) for HMAC pass/fail, clock-skew reject, nonce replay reject.
  - **Acceptance:**
    - Valid HMAC + fresh nonce → handler dispatches and stub returns `{ ok: true }`
    - Tampered body → `{ ok: false, code: "HMAC_INVALID" }`
    - Stale timestamp (>5 min) → `{ ok: false, code: "CLOCK_SKEW" }`
    - Replayed nonce within 10 min → `{ ok: false, code: "REPLAY" }`
    - `HMAC_KEY` is in Script Properties (not hardcoded)
    - Tests pass in Apps Script test runner
  - **Depends on:** T-2.1, T-2.7
  - **Artifacts:** `source/apps-script/gateway.js`, `source/apps-script/tests/gateway.test.js`
  - **Risk:** medium — this is the hardest correctness-critical Apps Script code; split from business logic to make it testable in isolation

- [ ] **T-2.8b** Apps Script business handlers: sheet write, refCode, email — Implement the three handler functions (`handleRegister`, `handleUnconference`, `handleDJSignup`) invoked by the gateway in T-2.8a. Each handler: (a) maps payload fields to sheet columns per R7.2; (b) generates `KF-XXXXX` refCode (5-char `[A-Z0-9]` from a collision-safe RNG); (c) appends the row to the correct sheet tab (lock already held from gateway); (d) sends a confirmation email via `GmailApp.sendEmail()` with `from` = organizer Gmail (default `.gmail.com`), `replyTo` = `hello@kinfusion.dance`, explicit "this is an application, not a confirmation" language, and the refCode in the subject `Kin-Fusion Campout — application received (KF-XXXXX)`; (e) returns `{ ok: true, refCode }`. Email templates live in `source/apps-script/templates/*.html` for easy organizer edits.
  - **Acceptance:**
    - A valid end-to-end POST to staging writes a row with all R7.2 columns populated
    - refCode format matches `KF-[A-Z0-9]{5}` and is unique across 100 synthetic submissions
    - Confirmation email arrives in the organizer inbox with correct `from`, `replyTo`, subject containing refCode, body with "application received — not yet confirmed" language
    - All three form types route to the correct sheet tab
    - `SHEET_ID` and `FROM_EMAIL` are in Script Properties (not hardcoded)
  - **Depends on:** T-2.8a
  - **Artifacts:** `source/apps-script/handlers/register.js`, `source/apps-script/handlers/unconference.js`, `source/apps-script/handlers/dj.js`, `source/apps-script/templates/register-confirmation.html`, `source/apps-script/templates/unconference-confirmation.html`, `source/apps-script/templates/dj-confirmation.html`
  - **Risk:** medium — email deliverability must be confirmed against a real inbox before Phase 3; GmailApp quota 100/day on free Gmail — adequate for 90 attendees

- [ ] **T-2.9** First-form end-to-end smoke against staging — After T-2.8b, submit a single hand-crafted `curl` to `/api/register` on the preview Worker pointing at staging Apps Script. Verify the full chain: Worker validation → HMAC forward → Apps Script gateway → business handler → staging sheet row → confirmation email in organizer inbox. This is a lightweight "smoke" ahead of the polished forms in T-2.10/T-2.11/T-2.12 — flushes any auth, URL, or HMAC configuration mistakes BEFORE building the three client forms.
  - **Acceptance:**
    - One `curl -X POST https://<preview>/api/register -d <test-payload>` succeeds and returns a refCode
    - One staging sheet row appears with correct data
    - One confirmation email arrives in the organizer inbox within 30 seconds
    - Repeat submission (same nonce) is rejected with `{ ok: false, code: "REPLAY" }`
  - **Depends on:** T-2.8b
  - **Artifacts:** none (verification task; results documented in PR comment or runbook appendix)
  - **Risk:** low — catches deployment/URL/secret bugs before three polished forms are finished

- [ ] **T-2.10** Shared client form module — Create `source/src/js/form-handler.js`: a single ES-module-exported factory that takes a form element and configuration (form name, fields to serialize, success/error handlers) and wires up form-token fetch (POST), Turnstile callback registration, submit-button disable-on-first-click, "submitting..." state, 5-second Turnstile-load-timeout surfacing an inline `mailto:hello@kinfusion.dance` fallback, response parsing (`DUPLICATE`, `RATE_LIMITED`, `VALIDATION`, `TURNSTILE_INVALID` → human messages), and refCode display on success. A11y acceptance: errors announced via `aria-live="polite"` region; invalid fields get `aria-invalid="true"` and are focused on error. All three forms use this module; no copy/paste duplication.
  - **Acceptance:**
    - Module exports a single `initForm(formElement, config)` function
    - A unit test (vitest + jsdom) confirms submit-button disables on first click and re-enables on error
    - A unit test confirms `aria-live` announcement on validation error
    - No form page contains inline submit-handling code
  - **Depends on:** T-2.9
  - **Artifacts:** `source/src/js/form-handler.js`, `source/src/js/tests/form-handler.test.js`
  - **Risk:** low (closes the duplication-and-drift risk flagged by star-chamber)

- [ ] **T-2.11** Registration form HTML — Build the registration form in `src/register/index.njk`: all R7.2 fields (fullName, email, pronouns, tier radio buttons, scholarshipRequest, scholarshipNote, arrivalDay, stayMonday, kids counts, dietary notes, accessibility notes, howDidYouHear), **photo consent checkbox** (R8.4), **Code of Conduct required checkbox** (R4.9), **privacy notice + 90-day retention statement** (R4.10, R8.1, R8.2 wording), Turnstile managed widget, CSS-hidden honeypot field. Wire via `form-handler.js` from T-2.10. A11y: every field has a `<label>`, help text via `aria-describedby`, fieldset+legend for radio groups, `aria-required="true"` on required fields, `role="alert"` on the error region.
  - **Acceptance:**
    - All registration fields render with explicit `<label>` and `aria-describedby` on help text
    - Privacy notice + retention (90-day, deletion-date 2026-12-12) + photo-consent + Code-of-Conduct are all visible before the submit button
    - Turnstile widget appears; 5-second timeout shows the mailto fallback
    - Successful submission displays the refCode to the user
    - axe scan of the form page returns zero WCAG 2.2 AA violations
  - **Depends on:** T-2.10, T-1.8
  - **Artifacts:** `source/src/register/index.njk`, `source/src/register/registration.11tydata.js`
  - **Risk:** low

- [ ] **T-2.12** Unconference and DJ signup form HTML — Build the unconference proposal form (`proposerName`, `email`, `workshopTitle`, `description`, `duration` ∈ {30,60,90}, `materialsNeeded`, `preferredDay`, privacy notice, Turnstile, honeypot) and the DJ signup form (`djName`, `realName`, `email`, `setStyle`, `setLengthMin` ∈ {30,60,90,120}, `gearNeeded`, `links` SoundCloud/Bandcamp, privacy notice, Turnstile, honeypot). Both use `form-handler.js` from T-2.10. Style matches the registration form.
  - **Acceptance:**
    - Both forms submit end-to-end to staging and produce rows in the correct sheet tabs
    - Privacy notices + retention statement are present on both forms
    - Both forms use the shared `form-handler.js` module (no duplicated submit logic)
    - axe scan of both form pages returns zero WCAG 2.2 AA violations
  - **Depends on:** T-2.11
  - **Artifacts:** `source/src/unconference/index.njk`, `source/src/dj/index.njk`
  - **Risk:** low

- [ ] **T-2.13** Phase 2 end-to-end smoke (all three forms) — Submit one test registration, one unconference proposal, and one DJ signup through the preview site's staging forms (not `curl` — actual browser-driven submissions). Verify for each: row in correct sheet tab with all columns, refCode in row matches refCode shown to user, confirmation email arrives in organizer inbox with correct `from`/`replyTo`/subject, Worker tail log shows structured JSON success events.
  - **Acceptance:**
    - 3 sheet rows created (one per form type) with correct data and `KF-XXXXX` refCodes
    - 3 confirmation emails received in organizer inbox within 30 seconds; none in spam folder
    - Zero errors in Worker tail log for the three submissions
    - Duplicate submission (immediate re-send via browser back-button) returns "we already received this" and does not create a second row
  - **Depends on:** T-2.8b, T-2.12
  - **Artifacts:** none (verification task; results documented in PR comment)
  - **Risk:** medium — email deliverability to real inboxes must be confirmed here, not assumed; check spam folder too; if GmailApp confirmations land in spam, investigate and resolve before Phase 3

*Nurture and Secure umbrella tasks for Phase 2 will be created by the orchestrator (dependency pin audit, Worker secret rotation check, Apps Script permission review).*

---

## Phase 3 — Hardening + Ship

**Pre-requisites from Phase 2:** All three forms working end-to-end against staging. Worker unit tests passing. All R5.8 security headers present. Staging smoke verified.

**Deliverable:** A fully hardened, accessible, tested site live at `kinfusion.dance` with runbook, DNS, email routing, backup trigger, and launch checklist complete.

**Testable via:** `kinfusion.dance` resolves, all pages load over HTTPS, Lighthouse CI and axe CI pass in GitHub Actions, Playwright E2E golden path passes against staging, and the runbook documents every operational procedure.

#### Tasks

- [ ] **T-3.1** Accessibility CI with axe-core — Add `axe-core` (v4) to the CI workflow (`.github/workflows/preview.yml`). After `wrangler deploy --env preview`, run axe against every page URL using `@axe-core/cli` or Playwright+axe. Fail the workflow on any WCAG 2.2 AA violation. Fix any violations found (expected: residual focus management on form error states, colour contrast in edge cases — a11y was front-loaded into T-2.10/T-2.11/T-2.12 so the CI sweep should be clean or near-clean).
  - **Acceptance:**
    - CI workflow fails if axe reports any WCAG 2.2 AA violation on any of the 8 pages
    - Zero axe violations on current build
    - Form error states are announced via `aria-live` and associated via `aria-describedby`
  - **Depends on:** T-2.12
  - **Artifacts:** `.github/workflows/preview.yml` (modified), any a11y fixes in templates/CSS
  - **Risk:** low

- [ ] **T-3.2** Lighthouse CI — Add `lighthouse-ci` (LHCI) to the CI workflow. Run against the preview URL post-deploy. Fail on mobile performance < 85 or accessibility < 95. Configure `lighthouserc.json` with the R9.1 targets (performance ≥ 90, accessibility ≥ 95, best-practices ≥ 95, SEO ≥ 95) as assertions in warn mode; fail mode uses the 85/95 floor from R10.2.
  - **Acceptance:**
    - `lhci autorun` completes and results are posted as a PR check
    - All 8 pages pass the 85/95 fail thresholds on first run
    - Home page performance score ≥ 90 (LCP image correctly prioritised)
  - **Depends on:** T-3.1
  - **Artifacts:** `source/lighthouserc.json`, `.github/workflows/preview.yml` (modified)
  - **Risk:** low

- [ ] **T-3.3** Playwright E2E suite — Write Playwright 1.50+ tests covering the golden path for all three forms against the staging environment: load page → form-token fetched → fill fields → Turnstile managed (use test sitekey `1x00000000000000000000AA` in staging) → submit → assert refCode displayed → assert staging sheet row created (via Sheets API read-only check or Apps Script read endpoint). Also cover: duplicate submission returns friendly message, rate-limit (3 rapid submits) blocks the 4th.
  - **Acceptance:**
    - All three golden-path tests pass against the staging preview URL in CI
    - Duplicate and rate-limit negative tests pass
    - Playwright tests run in the CI workflow on every push to `main` and every PR
    - Tests use the Turnstile test sitekey (`1x00000000000000000000AA`) in staging, not the production key
  - **Depends on:** T-3.2, T-2.13
  - **Artifacts:** `source/e2e/register.spec.js`, `source/e2e/unconference.spec.js`, `source/e2e/dj.spec.js`, `source/playwright.config.js`
  - **Risk:** low

- [ ] **T-3.4** Security header audit and no-payment-data check — Verify all R5.8 headers are present and correct on both static asset responses and Worker API responses, using `curl -I`. Conduct a manual code scan confirming: no payment card fields in any form, no payment URLs in the Worker, no bank data in the sheet schema. Add a CI step that greps the source tree for banned field names (`cardNumber`, `cvv`, `bankAccount`, `routingNumber`). Document R12 non-goals explicitly in the runbook.
  - **Acceptance:**
    - `curl -I https://<preview>/` returns all 5 required security headers
    - `curl -I https://<preview>/api/register` (OPTIONS) returns all 5 required security headers
    - CI grep for banned payment-field names exits non-zero if any are found (and currently exits zero)
    - Runbook `docs/operations/runbook.md` has a "Security non-goals" section citing R12
  - **Depends on:** T-3.2
  - **Artifacts:** `.github/workflows/preview.yml` (modified), `source/docs/operations/runbook.md` (modified)
  - **Risk:** low

- [ ] **T-3.5** Operational runbook, weekly backup, AND 2026-12-12 retention-delete automation — Create `source/docs/operations/runbook.md` covering: (a) secret rotation (`TURNSTILE_SECRET`, `APPS_SCRIPT_HMAC_KEY`, `APPS_SCRIPT_URL`) step-by-step, (b) Apps Script redeploy via `clasp push && clasp deploy`, (c) Turnstile key rotation in the CF dashboard, (d) sheet restore from weekly backup, (e) incident escalation contacts, (f) DNS emergency (revert to last known good CF config), (g) post-event 90-day retention delete process, (h) Email Routing setup for `hello@`, `info@`, catch-all, (i) branch protection on `main` per R1.2. Add the **weekly backup trigger** (`apps-script/backup.js`): time-driven trigger exports the sheet as XLSX + JSON to a specified Drive folder every Sunday. Add the **retention-delete trigger** (`apps-script/retention.js`) per ADR R8.2/R8.3: time-driven trigger that fires daily and, on or after 2026-12-12, (i) archives aggregate counts to a read-only "KinFusion-2026-Archive" sheet (no PII), (ii) deletes rows from operational sheets, (iii) sends a notification email to the organizer confirming the archival. The trigger is a no-op before 2026-12-12.
  - **Acceptance:**
    - `source/docs/operations/runbook.md` exists and covers all 9 sections
    - `apps-script/backup.js` time-driven trigger fires weekly (verified via Apps Script trigger list)
    - `apps-script/retention.js` is a daily trigger; a dry-run with a simulated `DELETE_AFTER` of today produces an archive sheet row and logs a "would delete N rows" message — verified in staging
    - 2026-12-12 retention-delete date is hardcoded as a named constant `DELETE_AFTER_DATE` in `retention.js`
  - **Depends on:** T-2.8b
  - **Artifacts:** `source/docs/operations/runbook.md`, `source/apps-script/backup.js`, `source/apps-script/retention.js`, `source/apps-script/tests/retention.test.js`
  - **Risk:** low (closes ADR R8.2/R8.3 implementation gap — previously runbook-only)

- [ ] **T-3.6** DNS cutover, production sheet/Apps-Script creation, and launch — (a) Create the **production** Google Sheet (three tabs, same schema as staging) and Apps Script project, bound via clasp in a separate deployment. Set production Script Properties (`HMAC_KEY` = a freshly-generated prod key, `SHEET_ID` = prod sheet ID, `FROM_EMAIL`). Deploy as a Web App with "Anyone" access (URL is secret per R12.3). (b) Update `wrangler.toml` `[env.production]` with production `APPS_SCRIPT_URL` and `wrangler secret put APPS_SCRIPT_HMAC_KEY --env production` with the production HMAC key. (c) Point `kinfusion.dance` nameservers to Cloudflare; configure DNS CNAME/A for apex and `www`; enable "Always Use HTTPS" and HSTS with `preload`. (d) Enable Cloudflare Email Routing for `hello@`, `info@`, and catch-all forwarding to the organizer Gmail inbox. (e) Configure the `.gmail.com` → `hello@kinfusion.dance` "Reply-To" alias in the organizer's Gmail settings (documented in runbook). (f) Run the pre-launch drill (R10.5): submit via `https://kinfusion.dance/register/` → verify production sheet row → verify confirmation email not in spam → verify refCode. (g) Enable Cloudflare Web Analytics (cookieless). (h) Tag the git commit as `v1.0.0`. (i) Remove the "deploy skip" gate from `.github/workflows/production.yml` since a production project now exists.
  - **Acceptance:**
    - Production Sheet and Apps Script exist, distinct from staging (different IDs)
    - `https://kinfusion.dance` loads the site over HTTPS with a valid CF-provisioned certificate
    - `https://www.kinfusion.dance` redirects to the apex
    - A production form submission produces a sheet row in the production Sheet AND a confirmation email (not in spam)
    - Cloudflare Email Routing is active: an email to `hello@kinfusion.dance` arrives in the organizer Gmail inbox
    - CF Web Analytics is enabled and reporting page views
    - Playwright E2E suite passes against the production URL (with production Turnstile key configured)
    - Git tag `v1.0.0` is pushed; production workflow no longer skips deploy
  - **Depends on:** T-3.3, T-3.4, T-3.5
  - **Artifacts:** Cloudflare DNS zone configuration (manual), `.github/workflows/production.yml` (modified), production Google Sheet + Apps Script (manual; IDs documented in runbook), git tag `v1.0.0`
  - **Risk:** low (DNS propagation is visible and reversible); medium if Email Routing MX records conflict with pre-existing records on `kinfusion.dance`

*Nurture and Secure umbrella tasks for Phase 3 will be created by the orchestrator (dependency final audit, production secret verification, post-launch monitoring check).*

---

## Cleanup

The final cleanup task must cover:

- **Docs polish:** Review `CONTRIBUTING.md` for completeness — HEIC conversion commands, `clasp login` flow, secret rotation commands, preview vs production deploy distinction, `wrangler secret put` instructions.
- **MANIFEST.md:** Record all modules created (`worker/hmac.js`, `worker/turnstile.js`, `worker/middleware.js`, `worker/formToken.js`, `apps-script/handlers/*.js`, `apps-script/backup.js`) with descriptions and dependencies.
- **Runbook completeness check:** Walk every runbook section against the live system. Confirm the staging vs production Apps Script distinction is clearly documented.
- **Lessons learned:** Note the HEIC conversion friction, clasp first-time auth friction, and Turnstile + CSP interaction as known gotchas in `CONTRIBUTING.md`.
- **ADR update:** Add a brief "Consequences — observed" section to `docs/adr/2026-04-18-001-kinfusion-website-architecture.md` noting any deviations from the original decision.
- **Dependency freeze:** After 2026-08-01, freeze Eleventy major/minor per R2.1. Add a note to `package.json` and `CONTRIBUTING.md`.
- **Post-event checklist:** Record the 2026-12-12 retention delete deadline in a GitHub issue or calendar event so it is not forgotten.

---

## Risk Summary

| Risk | Phase | Severity | Mitigation |
|---|---|---|---|
| HEIC conversion forgotten on new machine or new photo ingest | 1 (T-1.1) | Medium | Build guard (R3.4), CONTRIBUTING.md, pre-commit hook note |
| clasp first-time OAuth setup friction | 2 (T-2.1) | Medium | Step-by-step in CONTRIBUTING.md; staging setup documented separately |
| Turnstile widget broken by too-strict CSP | 2 (T-2.5) | Medium | Browser test before unit-test sign-off; `challenges.cloudflare.com` allowlist explicit in headers helper |
| Confirmation email lands in spam | 2 (T-2.12) | Medium | Real-inbox test required at T-2.12 before Phase 3 proceeds; GmailApp from organizer Gmail is low-risk but must be verified |
| DNS cutover to kinfusion.dance | 3 (T-3.6) | Low | CF DNS is reversible; preview URL remains live as fallback |

---

*Model note: this plan is authored in `--autopilot --parallel` mode. The user prefers Sonnet for the orchestrator and teammate agents, with optional Opus for grooming subagents.*
