# Contributing to the Kin-Fusion Campout Website

## Prerequisites

- Node.js 22 (use `.nvmrc`: `nvm use`)
- Wrangler 4: `npm install -g wrangler`
- For HEIC photo conversion (Linux): `sudo apt install libheif-examples`
- For photo resizing: `sudo apt install imagemagick`

---

## Adding Photos

All source photos live in `src/assets/`. Every file must be JPG or PNG, and must be under 12 MB. The build will fail with a clear error if any source file exceeds 12 MB.

### HEIC Conversion

HEIC files (common from iPhones) must be converted to JPEG before committing. **Do not commit `.HEIC` files** — the build pipeline does not support them.

**Linux:**
```bash
sudo apt install libheif-examples
heif-convert path/to/photo.HEIC path/to/photo.jpg
```

**macOS:**
```bash
sips -s format jpeg path/to/photo.HEIC --out path/to/photo.jpg
```

### Resizing Oversized Photos

If a photo is over 12 MB, resize it before copying to `src/assets/`:

```bash
# Resize to max 5000px wide, quality 85 (typically reduces 10-13 MB to 2-4 MB)
convert "large-photo.jpg" -resize "5000x5000>" -quality 85 "resized-photo.jpg"
```

### Photo Placement and Alt Text Policy

- **Hero / above-the-fold placements:** Use landscape, venue, or abstract shots. Avoid photos where individuals are clearly identifiable.
- **Inner pages:** People shots are fine at low visual prominence.
- **Alt text:** Describe what is shown. Do not name individuals. For decorative images, use `alt=""`.
- Subject consent has been confirmed by the organizers for all 10 existing assets.

### Image Shortcode Usage

In Nunjucks templates, use the `{% image %}` shortcode:

```njk
{# Hero image — sets fetchpriority="high", loading="eager" #}
{% image "at the edge of nature.jpg", "Forest path at Rhizome Springs", { hero: true } %}

{# Regular image — sets loading="lazy", decoding="async" #}
{% image "dance.jpg", "Fusion dancers at Kin-Fusion Campout" %}
```

---

## Local Development

```bash
cd source/
npm install
npm run build     # Build the static site to _site/
npm start         # Build and serve with hot-reload
```

For the Worker + static assets (full stack):
```bash
npm run build
wrangler dev      # Serves at http://localhost:8787
```

---

## Wrangler Deploy

**Preview (from any non-main branch):**
The GitHub Actions workflow handles this automatically on push. To deploy manually:
```bash
cd source/
npm run build
wrangler deploy --env preview
```
Requires `CF_API_TOKEN` and `CF_ACCOUNT_ID` environment variables or Wrangler authentication.

**Production (from main branch):**
```bash
cd source/
npm run build
wrangler deploy --env production
```
Production deployments are gated — the production Cloudflare project must exist (created in T-3.6).

---

## Environment Setup

This section documents every provisioning step required before the form backend works.
Run these steps once per environment (preview and production).

### Step 1: Create the KV Namespace

```bash
# Create RATE_KV namespace for preview (rate-limiting, dedupe, form tokens)
wrangler kv:namespace create RATE_KV
# → outputs: { binding = "RATE_KV", id = "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" }
# Paste the id value into wrangler.toml [[kv_namespaces]] id field

wrangler kv:namespace create RATE_KV --preview
# → outputs preview_id — paste into wrangler.toml preview_id field

# Verify
wrangler kv:namespace list
```

### Step 2: Create Turnstile Widget

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) → Turnstile → Add Site
2. Set the following hostnames:
   - `kinfusion.dance`
   - `kinfusion-website-preview.<your-account>.workers.dev` (preview)
3. Copy the **Site Key** → paste into `source/src/_data/site.json` as `turnstileSitekey`
4. Copy the **Secret Key** for the next step

```bash
# Set the Turnstile secret key
wrangler secret put TURNSTILE_SECRET
# Paste the Secret Key from the Turnstile dashboard when prompted
```

For staging/local dev, use the test sitekey `1x00000000000000000000AA` (already in `site.json`
as `turnstileSitekeyStaging`) — it always passes without showing a challenge.

### Step 3: Generate and Set HMAC Key

```bash
# Generate a 32-byte random hex key
openssl rand -hex 32
# Save the output — you'll need it for both Worker and Apps Script Script Properties

# Set the Worker secrets
wrangler secret put APPS_SCRIPT_HMAC_KEY
# Paste the generated hex string when prompted

# Generate a separate form token signing key (recommended — avoids key reuse)
openssl rand -hex 32
wrangler secret put FORM_TOKEN_SECRET
# Paste the new hex string when prompted
```

### Step 4: Bootstrap Apps Script (placeholder)

```bash
# Set placeholder URL — real URL set after Apps Script is deployed (T-2.1)
wrangler secret put APPS_SCRIPT_URL
# Paste: https://script.google.com/TBD/exec
```

After completing T-2.1 (staging Apps Script deployed), update with the real URL:
```bash
wrangler secret put APPS_SCRIPT_URL --env preview
# Paste the real staging Web App URL
```

### Step 5: Verify All Secrets Are Set

```bash
wrangler secret list
# Should show: TURNSTILE_SECRET, APPS_SCRIPT_URL, APPS_SCRIPT_HMAC_KEY, FORM_TOKEN_SECRET
# Values are hidden — only names are shown
```

### Apps Script Setup (for T-2.1)

```bash
# Install clasp globally
npm install -g @google/clasp

# Login with the organizer Google account
clasp login

# After creating the staging Google Sheet manually (3 tabs: Registrations,
# UnconferenceProposals, DJSignups), bind a new Apps Script project:
cd source/apps-script
clasp create --type sheets --title "KinFusion Forms (staging)" --parentId <STAGING_SHEET_ID>
# This creates .clasp.json (gitignored — per-developer file)

# Push source code to Apps Script
clasp push

# Deploy as Web App (run from Apps Script editor or CLI)
clasp deploy --description "staging v1"
# Copy the Web App URL → use for APPS_SCRIPT_URL secret above

# Set Script Properties in Apps Script editor → Project Settings → Script Properties:
# HMAC_KEY = <same hex value as APPS_SCRIPT_HMAC_KEY wrangler secret>
# SHEET_ID = <staging sheet ID from the URL: /spreadsheets/d/SHEET_ID/edit>
# FROM_EMAIL = <organizer Gmail address e.g. liam.helmer@gmail.com>
# NONCE_CACHE_MIN = 10
```

---

## Branch Protection

The `main` branch requires a reviewer approval before merging. This is documented in `docs/operations/runbook.md`.

---

## Dependency Freeze (post-2026-08-01)

Per ADR R2.1: after **2026-08-01**, Eleventy major or minor version upgrades **MUST NOT** be applied until after **2026-09-14** (post-event). Patch upgrades within 3.1.x are permitted.

Current pinned versions:
- `@11ty/eleventy`: `3.1.5`
- `@11ty/eleventy-img`: `6.0.0`

To upgrade after 2026-09-14: run `npm update @11ty/eleventy`, verify the build, update `MANIFEST.md`.

---

## Post-Event Retention Deadline (2026-12-12)

Personal data in the Google Sheets must be deleted by **2026-12-12** (90 days after event end 2026-09-13) per ADR R8.2.

The `apps-script/retention.js` daily trigger handles this automatically — it is a no-op until that date. On or after 2026-12-12 it archives aggregate counts and deletes all PII rows.

**Set a calendar reminder for 2026-12-13** to verify the retention delete ran:
1. Open the production Google Sheet
2. Confirm the `KinFusion-2026-Archive` tab exists with row counts
3. Confirm `Registrations`, `UnconferenceProposals`, `DJSignups` tabs are empty (headers only)
4. Check organizer inbox for the notification email from Apps Script

If the trigger did not run automatically: open the Apps Script editor → Triggers → verify `runRetentionCheck` is active, then run it manually.

---

## Lessons Learned

Known friction points encountered during development — read before making changes.

### HEIC Conversion

The `heif-convert` tool (Linux) must be installed separately (`sudo apt install libheif-examples`). On macOS use `sips`. On a fresh machine this step is easy to miss. The build will fail with a clear error if `.HEIC` files are present in `src/assets/`, but the error only appears at build time, not at `npm install` time.

### clasp First-Time OAuth

Running `clasp login` for the first time opens a browser OAuth flow. In headless or SSH environments you must use `clasp login --no-localhost` and follow the manual code-copy flow. The generated `~/.clasprc.json` file is per-developer and must never be committed. The project `.clasp.json` is also per-developer and is gitignored — each developer must run `clasp create` or `clasp clone` once to set up their local binding.

After `clasp push`, always run `clasp deploy --description "vN"` to create a new versioned deployment — the Web App URL does not change on push without an explicit deploy.

### Turnstile + CSP Interaction

The Cloudflare Turnstile managed widget requires `challenges.cloudflare.com` in the CSP `frame-src`, `script-src`, and `connect-src` directives. A too-strict CSP will silently break the widget (the iframe loads but the challenge never resolves). This was caught during Phase 2 hardening. Always verify the Turnstile widget in a real browser after any CSP change — unit tests cannot catch this.

### Email Deliverability Uncertainty

GmailApp sends confirmation emails from the organizer's Gmail address (`@gmail.com`), not from `hello@kinfusion.dance`. This is by design (all-Google identity chain avoids SPF/DKIM/DMARC gaps), but it means the `From:` line is not the branded domain. Deliverability to external inboxes was not confirmed against a live production run during development — it must be verified as part of the T-3.6 pre-launch drill. If emails land in spam, investigate Gmail sending rate limits and consider adding a custom `X-Entity-Ref-ID` header.

### Staging vs Production Apps Script

Each environment has a completely separate Apps Script deployment and Google Sheet. The staging deployment URL is stored in `wrangler.toml` `[env.preview]` as a `vars` entry; the production URL is a `wrangler secret`. Never share Script Property values between staging and production — in particular, the `HMAC_KEY` values must be different.

### production.yml Deploy Gate

The production workflow was written with an early-exit guard that prevented deploying before the production Cloudflare project existed. This guard was removed in Phase 3 (commit 7537435). If you see the production workflow completing with a "skipping deploy" log message, the guard may have been accidentally reintroduced — check `.github/workflows/production.yml` for `CF_API_TOKEN` conditional logic.
