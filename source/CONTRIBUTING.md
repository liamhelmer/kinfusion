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

Before running the Worker locally with form routes, the following secrets must be configured:

```bash
# Set Cloudflare Turnstile secret key
wrangler secret put TURNSTILE_SECRET

# Set Apps Script HMAC key (generate with: openssl rand -hex 32)
wrangler secret put APPS_SCRIPT_HMAC_KEY

# Set Apps Script Web App URL (set after T-2.1)
wrangler secret put APPS_SCRIPT_URL
```

KV namespace setup:
1. Create the `RATE_KV` namespace in the Cloudflare dashboard (Workers & Pages → KV)
2. Copy the namespace ID into `wrangler.toml` under `[[kv_namespaces]]`

---

## Branch Protection

The `main` branch requires a reviewer approval before merging. This is documented in `docs/operations/runbook.md`.
