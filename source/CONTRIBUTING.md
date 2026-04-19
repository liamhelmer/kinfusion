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

# Set the Worker secret
wrangler secret put APPS_SCRIPT_HMAC_KEY
# Paste the generated hex string when prompted
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
# Should show: TURNSTILE_SECRET, APPS_SCRIPT_URL, APPS_SCRIPT_HMAC_KEY
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
