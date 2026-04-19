# Kin-Fusion Campout Website — Research

**Date:** 2026-04-18
**Event:** Kin-Fusion Campout — fusion dance unconference, Rhizome Springs, Saltspring Island BC, Sept 10-13 2026
**Audience:** ~90 participants; family-friendly (kids <=12 free); sliding scale $300/$350/$400
**Domain:** `kinfusion.dance`
**Hosting constraint:** Cloudflare free tier (Pages + Workers)

> Provenance convention: non-obvious factual claims are footnoted with a `[[n]]` link to the source. Version numbers include the source URL. Anything not directly confirmed is flagged `(uncertain)`.

---

## 1. Cloudflare Pages / Workers landscape (April 2026)

### 1.1 Platform convergence — status

- The Pages + Workers convergence was announced **May 17, 2023** and has progressed steadily since. [[1]]
- As of early 2026, Cloudflare explicitly recommends **starting new projects on Workers (with Static Assets)** rather than Pages. Quote from the migration guide: *"Now that Workers supports both serving static assets and server-side rendering, you should start with Workers. Cloudflare Pages will continue to be supported, but, going forward, all of our investment, optimizations, and feature work will be dedicated to improving Workers."* [[2]]
- Existing Pages projects keep working; Pages is **not EOL** but is in maintenance mode. New platform features land on Workers first.
- A single `wrangler.toml` (or `wrangler.jsonc`) defines static assets + API routes + bindings in one project.

**Implication for Kin-Fusion:** start with **Workers + Static Assets** from day one. Same DX as Pages used to offer, plus we get the form-handling Worker in the same project without a second deploy. [[2]]

### 1.2 Free-tier limits (verified 2026-04)

| Resource | Free tier | Source |
|---|---|---|
| Worker script requests | **100,000 / day**, resets midnight UTC | [[3]] |
| CPU time per invocation | **10 ms** (free) | [[3]] |
| Requests to static assets | **Free and unlimited** (no bandwidth charge) | [[4]] |
| Bandwidth / egress | No explicit free-tier cap documented; Workers paid plan has no egress charge either | [[3]] |
| Workers KV | 100k reads/day, 1k writes/deletes/day, 1 GB storage | [[3]] |
| Durable Objects storage | 5 GB total on free plan (SQLite-backed) | [[5]] |
| Logs | 200k log events/day, 3-day retention | [[3]] |
| Queues | Free plan since **2026-02-04** — up to 10k queues | [[6]] |
| Turnstile | **Unlimited** verifications, 20 widgets / account, 10 hostnames / widget | [[7]] |

**Pages-specific limits (if we still deploy on Pages instead):**

| Resource | Free tier | Source |
|---|---|---|
| Builds / month | **500** | [[8]] |
| Concurrent builds | **1** | [[8]] |
| Build timeout | **20 minutes** | [[8]] |
| Max single file size | **25 MiB** | [[8]] |
| Max files per deployment | **20,000** | [[8]] |

> 90-attendee event with 3 forms will never approach any of these. A single form submission costs one Worker invocation; even worst case we're at ~500 requests total for the whole season, well under 100k/day.

### 1.3 Build image / Node.js floor

- Cloudflare Pages v3 build image provides **Node.js v22 by default** as of 2026-05 changelog. [[9]]
- v1 build image auto-migrates to v3 on **2026-09-15**; v2 auto-migrates **2027-02-23**. [[9]]
- **Do not** pin to Node 18 (EOL) or use codename aliases like `lts/hydrogen` — unsupported in v3. [[9]]
- Workers builds (the Workers-side CI) have their own limits/pricing documented separately. [[10]]

**Recommendation:** target Node 22 LTS; declare via `.nvmrc` or `NODE_VERSION` env var.

---

## 2. Static-site generators for photo-heavy small sites

### 2.1 Candidate shortlist (2026-04)

| SSG | Latest stable | Output | Cloudflare fit | Image pipeline | Size of footprint |
|---|---|---|---|---|---|
| **Astro** | **6.0** (released 2026-03-10) [[11]] | Static or SSR, island hydration | First-class. Cloudflare **acquired Astro Technology Company 2026-01-16** [[12]]. `astro dev` now runs on `workerd`. | Built-in `<Image>` / `<Picture>` with sharp; AVIF+WebP at build time | Medium (Node + Vite + sharp) |
| **Eleventy (11ty)** | **3.1.5** (2026-03-18) [[13]] | Pure static HTML | Works fine — just `npm run build`, deploy the `_site` dir. No adapter needed. | `@11ty/eleventy-img` plugin, sharp-based | **Smallest** (few deps, no bundler by default) |
| **Hugo** | **0.152.2** [[14]] | Pure static HTML | Works fine. Single Go binary, no npm. | Built-in image processing via libvips-like ops | **Smallest** (single binary, no JS runtime) |
| **SvelteKit** (`adapter-static`) | n/a — overkill for 10-page site; `adapter-cloudflare-workers` **deprecated**, use `@sveltejs/adapter-cloudflare` for SSR or `adapter-static` for pure static [[15]] | Static or SSR | Good, but pulls Svelte runtime + build complexity | No first-class; relies on 3rd-party (`enhanced:img`, `unpic`, etc.) | Larger |
| **Plain HTML** | n/a | Static | Works | Hand-craft `<picture>` + srcset | Smallest possible, but form wiring and image responsive-generation become manual |

### 2.2 Recommendation: **Astro 6**

**Rationale:**
1. **Cloudflare owns Astro** as of Jan 2026 — deepest integration, best long-term support bet. [[12]]
2. Built-in `<Image>` / `<Picture>` with AVIF+WebP responsive generation solves the photo-heavy use case without extra plumbing. [[16]]
3. Static output is the default — no adapter needed for pure-static deployment. [[17]] Keeps "minimal dependencies" spirit.
4. Content collections + MD/MDX are ideal for schedule, FAQ, unconference description.
5. Small islands of interactivity (form, image lightbox) stay zero-JS-by-default; we only ship JS where needed.

**Runner-up: Eleventy 3.1.5** — if the user prefers a Node-based static generator with less magic. Viable for this project but photo pipeline is a bit more hands-on (compose `@11ty/eleventy-img` yourself).

**Avoid for this project:** SvelteKit (overkill, complexity tax), Hugo (Go toolchain unfamiliar to many collaborators; image pipeline solid but community has less CF-specific tooling).

### 2.3 Deprecations / gotchas per candidate

**Astro 6:**
- Dev server now uses **workerd** runtime, not Node. Mirrors production closely but some Node-only libs may not work at dev time. [[11]]
- If you later add SSR on Cloudflare, require `@astrojs/cloudflare@13+` (Astro 6 breaks with older adapter versions). [[11]][[18]]
- `astro:assets` is the one supported image API — older `@astrojs/image` integration is long-removed.
- For **pure-static output, do NOT install `@astrojs/cloudflare`** — builds have been reported to fail. [[19]]

**Eleventy 3.x:**
- Eleventy **4.x is pre-release** ("Build Awesome v4" rebrand). Don't adopt for this project. [[20]]
- ESM-first; CommonJS config files are deprecated.
- `eleventy-img` works but requires wiring into a shortcode; not automatic.

**Hugo:**
- If you go Hugo, pin the exact binary version in CI — Hugo releases sometimes change template APIs.
- HEIC input via Hugo's image pipeline is **not** supported directly — requires pre-conversion.

### 2.4 "Plain HTML" option

Genuinely viable for 10 pages. Pros: zero build, zero dependencies. Cons:
- Manually maintain `<picture>` blocks with AVIF/WebP variants (boring, error-prone).
- Need an external tool anyway to generate the variants (`sharp-cli`, `cwebp`, etc.).
- No partial templating → copy/paste for header/footer.

If plain-HTML is chosen, pair it with a **one-shot image prep script** (Node + sharp) that regenerates `/img` outputs from `/assets` sources on demand. This gives 80% of an SSG for 20% of the complexity. (See §3.)

---

## 3. Image optimization pipeline

### 3.1 Inventory in `../assets/`

10 files, ~40 MB total:

| File | Size | Format | Note |
|---|---|---|---|
| `at the edge of nature.jpg` | 6.1 MB | JPG | Large hero candidate |
| `dance.jpg` | 3.8 MB | JPG | — |
| `discussion tent.JPG` | 1.6 MB | JPG | — |
| `IMG_6605.HEIC` | 1.2 MB | **HEIC** | Needs conversion |
| `KinFusion_FB_Banner_2.png` | 362 KB | PNG | Logo/banner |
| `night dome 4.jpeg` | 190 KB | JPG | — |
| `night dome 6.jpg` | 49 KB | JPG | Already small |
| `outdoor eating.jpg` | **12.9 MB** | JPG | Oversized — must process |
| `spontaneous dance party at the kitchen.jpg` | **11.3 MB** | JPG | Oversized — must process |
| `sunset.HEIC` | 2.8 MB | **HEIC** | Needs conversion |

### 3.2 Options: Cloudflare Images vs Polish vs build-time

**Cloudflare Images (Transformations):**
- Free plan = **5,000 unique transformations / month** for images stored on an **external origin** (e.g., R2 or our own site). Extra transforms return an error (no overage bill). [[21]]
- Beyond free: $0.50 / 1k unique transformations. [[21]]
- Storage on CF Images bucket is paid only ($5 / 100k images/month) — **do not** use this, just store images as site assets / in R2.
- Best for on-the-fly variants from arbitrary URL params. Overkill for a 10-photo site.

**Cloudflare Polish:**
- Part of **Pro plan ($20/month)** or higher. Automatic image recompression on cache. Not free. [[22]]
- **Skip** — out of budget posture.

**Build-time optimization (Astro Image / sharp / `eleventy-img`):**
- Zero runtime cost, zero dependency on CF's transform quota.
- Generates static `.avif` / `.webp` / `.jpg` variants once, ships them as regular static assets (free + unlimited on Workers Assets [[4]]).
- Lightning-fast: CF CDN caches them globally; no per-request compute.
- Exact control over sizes and formats.

### 3.3 Recommendation: **Build-time optimization via Astro `<Image>` / `<Picture>`**

Why:
- The photo set is tiny (10 sources). Build-time is cheap, runtime cost is zero.
- Free-tier-safe forever; no transform quota to worry about.
- Works identically in dev/prod.
- Falls back gracefully if JS is disabled (ships plain `<img>` with srcset).

### 3.4 Handling the two HEIC files

HEIC support status (2026):
- **Safari only** natively supports HEIC. Chrome, Firefox, Edge do **not**. [[23]]
- `sharp` **does not ship HEIC support** in its prebuilt binaries because HEVC is patent-encumbered. Requires a globally-installed libvips built with libheif/libde265/x265 — a real pain on Cloudflare's build image. [[24]]

**Recommendation: pre-convert at the source, commit the converted files.**

Workflow (one-time, run locally):
```bash
# macOS: sips is pre-installed; handles HEIC -> JPEG in one shot
sips -s format jpeg "assets/sunset.HEIC"    --out assets/sunset.jpg
sips -s format jpeg "assets/IMG_6605.HEIC" --out assets/IMG_6605.jpg

# Linux: use heif-convert from the libheif-tools package
# sudo apt install libheif-examples
heif-convert assets/sunset.HEIC assets/sunset.jpg
```

Then commit the `.jpg` outputs and remove HEICs from the build input. This avoids carrying libheif in CI and side-steps the patent story entirely.

> Do **not** attempt runtime HEIC decode in the browser or via `heic2any`/WASM for hero photos — adds ~3 MB of JS and kills LCP. Only worth it for a user-upload flow (not this project).

### 3.5 Recommended 2026 format/size policy

**Formats served:**
- AVIF (primary, best compression)
- WebP (fallback for ~3% of traffic without AVIF)
- JPEG (universal fallback; shouldn't be reached on any 2026 browser)
- PNG only for logos/icons with transparency

> AVIF has ~95%+ global support (Safari 16.4+, Chrome/Edge/Firefox all current). WebP has ~97% per caniuse (2026). [[25]]

**Breakpoints (widths) for hero / gallery:**
- `480, 768, 1024, 1440, 1920` with `sizes="(max-width: 768px) 100vw, 80vw"` typical.
- Use Astro's `<Picture>` with `widths` and `formats={['avif','webp','jpg']}`.

**Max served sizes:**
- No single rendered variant above ~1920 px wide unless art-directed fullscreen hero. AVIF @ 1920 ≈ 150-300 KB typically; compare to 12.9 MB source.
- Budget the whole homepage-above-the-fold to <500 KB transferred.

### 3.6 Serving 10+ MB photos responsibly

1. **Lazy-load below the fold** — `<img loading="lazy">` or Astro default for `<Image>`. Hero gets `loading="eager" fetchpriority="high"`.
2. **LQIP (low-quality image placeholder):** prefer **ThumbHash** (~2.7 KB runtime, better quality than BlurHash) *or* the **CSS-only LQIP** technique (no JS) for the simplest version. [[26]]
   - For Astro, `@unpic/astro` or a custom ThumbHash helper works; if we want truly zero JS, embed a base64 blurred `<img>` and swap via CSS container/`object-fit`.
3. **`decoding="async"`** on all non-critical images.
4. **Art direction** for hero: use `<picture>` source media queries to serve a 9:16 crop on mobile, 16:9 on desktop — one of the 12MB shots at 9:16 crop is dramatically smaller.
5. **Explicit `width`/`height`** on every image to reserve layout space → CLS = 0.
6. **Gallery pattern:** masonry/grid of thumbnails (~400 px wide AVIF, <50 KB each); click opens full-size in a lightbox. Makes the page lightweight even with many photos.

---

## 4. Form → Google Sheets integration

Three forms: **signup** (name, email, pricing tier, dietary, pronouns, kids, etc.), **unconference proposal**, **DJ signup**. Data lands in Google Sheets. Non-technical maintainers own the sheet.

### 4.1 Options evaluated

| Option | Cost | Server-side logic possible? | Capacity cap | Confirmation email | Non-tech friction | Maintenance |
|---|---|---|---|---|---|---|
| A. **Google Apps Script Web App webhook** — Worker POSTs to a deployed Apps Script URL; script appends row | Free | Yes (in Apps Script) | Yes (count rows, reject if full) | Yes (GmailApp) | Low (they already own the sheet) | Low; script lives on sheet |
| B. **Worker → Google Sheets REST API** (service account + JWT) | Free | Yes (in Worker) | Yes | Needs separate email sender (Resend/MailChannels) | Medium (service account + key rotation) | Medium (Worker code owns flow) |
| C. **Formspree / Getform** | Formspree free = **50 submissions/month** total [[27]]. 90 attendees × 3 forms = up to 270 submissions → paid tier required ($10/mo Formspree, $9/mo Getform start). | No / limited | No cap enforcement | Yes | Very low | Low — vendor handles it |
| D. **Tally** (embedded form) | Free, unlimited submissions + Google Sheets sync [[28]] | Limited (Tally logic only) | Limited (Tally has "limits" feature) | Yes (Tally) | Lowest — no-code form builder | None |
| E. **Google Forms embed** | Free, syncs to Sheets natively | Limited | Sheet-level check only via Apps Script trigger | Limited | Very low | Lowest, but ugly forms |
| F. **Cloudflare Pages Forms / Workflows** | No such product. Cloudflare has Workflows (Jan 2025 GA) for orchestrated async work, but no "Pages Forms". | — | — | — | — | — |

### 4.2 Recommendation: **Option B — Worker → Google Sheets API** (preferred), with **Option A as simpler fallback**

**Option B details:**
- Frontend posts form data to our own endpoint (e.g., `/api/signup`), served by the same Worker that serves static assets.
- Worker validates, Turnstile-checks, rate-limits, **enforces the 90-person cap** (count existing rows in Sheet, or — much faster — track in **Workers KV** with the Sheet as source-of-truth).
- Worker signs a JWT with the service-account key (from Worker Secrets), exchanges it for an OAuth token, calls `spreadsheets.values:append`. [[29]]
- On success: optional confirmation email via **MailChannels → Resend → or Gmail API with the same service account** (Resend free tier is current recommendation; MailChannels Workers free route was sunsetted — verify in ADR).
- Secrets: service-account private key (JWK), Spreadsheet IDs, Turnstile secret. Managed via `wrangler secret put`.

**Why B over A:**
- **Capacity enforcement** is atomic inside the Worker. With Apps Script, racing submissions can both see "89 signups" and both succeed → 91 attendees. Apps Script has coarse locking (`LockService`) but it's clunkier than a Worker + KV counter.
- **Turnstile** verification happens in the same Worker that holds the secret; clean flow.
- **Spam surface** is smaller — Apps Script URL is directly POSTable by anyone; our Worker can rate-limit first.
- **Error handling & logging** in Workers Observability is easier than debugging Apps Script.

**Why A is still in the running:**
- Non-technical maintainer can edit business logic (email template, field validation) **directly in the sheet's bound Apps Script**. No redeploys.
- Fewer moving parts (no service account, no key rotation).
- Zero Google Cloud project setup.

**Decision rule to raise in questionnaire:** *"Who owns the form logic after the event launches — Liam, or the community organizer who owns the sheet? If the latter, A wins; if the former, B wins."*

### 4.3 Capacity cap pattern (90-attendee limit) — Option B sketch

```ts
// /api/signup on Worker
export async function handleSignup(req, env) {
  const body = await req.formData();
  await verifyTurnstile(body.get('cf-turnstile-response'), env);
  await checkRateLimit(req.headers.get('cf-connecting-ip'), env.KV);

  // Atomic capacity guard
  const current = Number(await env.KV.get('signup_count')) || 0;
  if (current >= 90) return new Response('sold out', { status: 409 });

  await appendRowToSheet(env.SHEET_ID, body, env);
  await env.KV.put('signup_count', String(current + 1));
  await sendConfirmationEmail(body.get('email'));
  return new Response('ok');
}
```

> KV is eventually consistent (~60s globally), so a true race is theoretically possible. For 90-person capacity it's fine. If stricter: use **Durable Objects** with atomic storage for the counter — free plan covers this easily. [[5]]

### 4.4 CSV export & maintainer workflow

- Google Sheets' built-in "Download as CSV" covers CSV export for free.
- Maintainers get `editor` on the Sheet; bookkeeping stays in a tool they already know.
- Sheet should have **separate tabs** per form (Attendees, Unconference Proposals, DJ Signups) — one service-account key can write all three.

---

## 5. Accessibility, SEO, performance expectations in 2026

### 5.1 Core Web Vitals thresholds (p75 of real-user traffic)

| Metric | Good | Needs Improvement | Poor | Notes |
|---|---|---|---|---|
| **LCP** (Largest Contentful Paint) | ≤ 2.5 s | 2.5-4.0 s | > 4.0 s | Unchanged from 2023 [[30]] |
| **INP** (Interaction to Next Paint) | ≤ 200 ms | 200-500 ms | > 500 ms | **INP replaced FID in March 2024** and remains current in 2026 [[30]] |
| **CLS** (Cumulative Layout Shift) | ≤ 0.1 | 0.1-0.25 | > 0.25 | Unchanged [[30]] |

A static Astro site with build-optimized images easily hits "Good" on all three if images are sized correctly.

### 5.2 Lighthouse baseline

- No formal 2026 change. Target **Performance >= 95**, **Accessibility 100**, **Best Practices 100**, **SEO 100** for a 10-page photo site. Totally achievable at this scope.

### 5.3 Accessibility standard

- **WCAG 2.2 AA** was ratified as ISO/IEC 40500:2025 in October 2025. [[31]]
- The April 24, 2026 ADA Title II deadline legally requires **WCAG 2.1 AA** for public entities. [[32]] Kin-Fusion is a private community event — **not legally bound** — but 2.2 AA is the current best-practice baseline and is a superset of 2.1 AA.
- **Target:** WCAG 2.2 AA. Key new 2.2 SCs relevant here:
  - Focus Not Obscured (Minimum)
  - Target Size (Minimum) — 24x24 px minimum touch target
  - Dragging Movements — all drag interactions need a non-drag alternative (we probably have none — fine)
  - Consistent Help
  - Redundant Entry — don't ask for the same info twice across forms
  - Accessible Authentication (Minimum)

**Practical checklist:**
- Semantic HTML (`<nav>`, `<main>`, `<h1>`…), labels on every form field, `aria-describedby` for hints, error messages associated via `aria-live`.
- Color contrast ≥ 4.5:1 (body) / 3:1 (large text). Verify the KinFusion banner color palette.
- All images have meaningful `alt` text; decorative ones get `alt=""`.
- Dark-mode optional; if added, must also meet contrast.
- Keyboard-operable lightbox if we add a gallery.

---

## 6. Spam / abuse mitigation for public forms

### 6.1 Cloudflare Turnstile (2026)

- **Free, unlimited** challenges. 20 widgets / account, 10 hostnames / widget — trivially enough for one site. [[7]]
- Two widget modes: **managed** (auto-adjusts difficulty), **invisible** (no visible challenge), and **non-interactive** (spinner). Use **managed** for public forms.
- DX: one `<script>` tag, one `<div class="cf-turnstile" data-sitekey="...">`, one server-side `siteverify` POST from the Worker (secret key stays server-side).
- No PII leaves Cloudflare — privacy-friendly vs reCAPTCHA. [[33]]

### 6.2 Layered pattern (recommended)

Defense in depth — *all three* cost essentially nothing:

1. **Honeypot field:** hidden `<input name="website" tabindex="-1" autocomplete="off">` — if filled, drop silently (never 4xx; makes bots think it worked).
2. **Turnstile token** verified server-side (`siteverify` with the secret).
3. **Rate-limit** per-IP: `/api/*` max 10 POSTs / minute / IP, tracked in KV or via Cloudflare WAF rate-limit rule. [[34]]

> The WAF's native rate-limiting rules are **free on all plans** for basic usage — configurable in dashboard, no Worker code needed. [[34]]

### 6.3 Additional low-cost defenses

- **Minimum time-to-submit:** reject submissions where the form was submitted <2 seconds after page load (bots are fast). Stamp a `ts` hidden field at render; compare on submit.
- **Origin check:** reject POSTs whose `Origin` header isn't `https://kinfusion.dance`.
- **Email format + MX check** on emails if we're feeling fancy (probably overkill for 90 people).

---

## 7. Prior art / reference implementations

Searching for *community event / festival / unconference* on Cloudflare Pages specifically turned up little that's directly comparable. [[35]] The pattern is common but case-studies are rare in public.

Useful reference projects / patterns (not necessarily festivals, but same stack shape):

- **`streamwall/sheet2json-worker`** — Worker that turns a Google Sheet into a JSON API. Shows the service-account JWT flow cleanly. [[29]]
- **`shreyvarshney1/sheetsync-cloud`** — Worker that handles form POSTs into a Sheet via env-var secrets. [[29]]
- **Cloudflare + Next.js forms guide by Websyro** — layered protection with Turnstile + Upstash + honeypot + logging. Stack is Next.js, but the **pattern is portable to Astro + Worker**. [[36]]
- **IndieWeb/static-site personal blogs on Pages** are legion; most useful for build config examples.

**Pitfalls from these references:**
- Committing the service-account JSON to git (accidentally). Use `wrangler secret put` exclusively.
- Leaving the Apps Script Web App as "Anyone can access, even anonymous" without an auth token. Add a shared secret header check.
- Forgetting to wire CORS when the form is on a different subdomain from the API.
- Assuming sharp's HEIC support will "just work" in CI — it won't. (See §3.4.)
- Relying on `MailChannels` free email path — it has been **sunsetted for new Workers accounts (2024)**; use Resend, Postmark, or similar. *(uncertain — verify in ADR before building email flow.)*

---

## 8. Domain & DNS — `kinfusion.dance`

### 8.1 Zone setup

- Add `kinfusion.dance` as a zone on Cloudflare (free plan). Point the registrar's nameservers to the Cloudflare-provided pair.
- Workers with Static Assets + custom domain: attach in the Workers dashboard → Triggers → Custom Domains → `kinfusion.dance` and `www.kinfusion.dance`. CF auto-provisions the cert and the proxy record.
- **HTTPS:** automatic via CF's Universal SSL. Turn on "Always Use HTTPS" and HSTS (≥ 6 months, include subdomains, preload if we're committed).

### 8.2 Email forwarding

- **Cloudflare Email Routing** is free and handles forwarding out-of-the-box. [[37]]
- Auto-provisions MX + TXT (SPF) records when enabled.
- Limitations: **receive-and-forward only**, not hosted mailboxes; you can't *send* from `hello@kinfusion.dance` through Email Routing. For sending, use Gmail "Send mail as" with an external SMTP (or Resend with a dedicated sender domain).
- Up to **200 forwarding rules** and one destination per rule. [[37]]
- Pattern: `hello@kinfusion.dance`, `signup@kinfusion.dance`, `dj@kinfusion.dance` → one or more organizer inboxes.

### 8.3 Other records

- **DMARC:** publish a `_dmarc.kinfusion.dance` TXT record with `p=quarantine` at minimum, since we'll be sending confirmation emails. Get it aligned with SPF/DKIM from the chosen sender (Resend hosts DKIM for you).
- **CAA:** optional; pin Let's Encrypt + Google Trust (CF's providers) to reject rogue issuance.

---

## 9. Cross-cutting recommendation summary

| Concern | Pick | Alternatives worth mentioning |
|---|---|---|
| Hosting | **Workers + Static Assets** (unified project) | Cloudflare Pages (still works, just not where the investment is going) |
| SSG | **Astro 6** | Eleventy 3.1.5 (more hands-on); plain HTML + sharp script (minimum viable) |
| Image pipeline | **Astro `<Image>` / `<Picture>` at build time** (AVIF + WebP + JPG) | Cloudflare Images Transformations (free up to 5k/mo; unnecessary at this scale) |
| HEIC handling | **Pre-convert locally, commit JPEGs** | Carry libvips+libheif in CI (painful, not recommended) |
| Form backend | **Worker → Google Sheets API** (service account) | Apps Script webhook (simpler but harder to enforce cap); Tally (zero-code if UX is acceptable) |
| Capacity cap | **KV counter in Worker** (or Durable Object for stricter atomicity) | Count rows in Sheet on each submit (slower, racey) |
| Spam | **Turnstile + honeypot + WAF rate limit + origin check** | Any single one of those alone |
| Email | **Resend free tier + DKIM on `kinfusion.dance`** | Gmail "Send mail as"; Postmark |
| Analytics | **Cloudflare Web Analytics** (free, privacy-friendly, no cookie banner) | Plausible self-hosted |
| Accessibility | **WCAG 2.2 AA** target | 2.1 AA minimum |

---

## Footnote sources

1. [Bringing a unified developer experience to Cloudflare Workers and Pages — Cloudflare Blog](https://blog.cloudflare.com/pages-and-workers-are-converging-into-one-experience/)
2. [Migrate from Pages to Workers — Cloudflare Workers docs](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)
3. [Pricing — Cloudflare Workers docs](https://developers.cloudflare.com/workers/platform/pricing/)
4. [Billing and Limitations (Static Assets) — Cloudflare Workers docs](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)
5. [Limits — Cloudflare Durable Objects docs](https://developers.cloudflare.com/durable-objects/platform/limits/)
6. [Cloudflare Queues now available on Workers Free plan — Changelog 2026-02-04](https://developers.cloudflare.com/changelog/post/2026-02-04-queues-free-plan/)
7. [Cloudflare Turnstile plans — Cloudflare docs](https://developers.cloudflare.com/turnstile/plans/)
8. [Cloudflare Pages Limits (fetched 2026-04)](https://developers.cloudflare.com/pages/platform/limits/)
9. [Cloudflare Pages builds now provide Node.js v22 by default — Changelog 2026-05-30](https://developers.cloudflare.com/changelog/post/2025-05-30-pages-build-image-v3/) *(note: the URL slug says 2025 but the default-flip landed in 2026 per the changelog body — verify date before citing externally; uncertain)*
10. [Workers CI builds limits & pricing — Cloudflare docs](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)
11. [Astro 6.0 release announcement](https://astro.build/blog/astro-6/)
12. [Astro is joining Cloudflare — Cloudflare Blog, 2026-01-16](https://blog.cloudflare.com/astro-joins-cloudflare/)
13. [Eleventy Release History — 11ty.dev](https://www.11ty.dev/docs/versions/)
14. [Hugo releases — gohugo.io](https://gohugo.io/)
15. [SvelteKit Cloudflare adapter docs](https://svelte.dev/docs/kit/adapter-cloudflare) and [adapter-cloudflare-workers deprecation](https://developers.cloudflare.com/pages/framework-guides/deploy-a-svelte-kit-site/)
16. [Astro Image and Assets API Reference](https://docs.astro.build/en/reference/modules/astro-assets/)
17. [Deploy your Astro Site to Cloudflare — Astro Docs](https://docs.astro.build/en/guides/deploy/cloudflare/)
18. [@astrojs/cloudflare 13.0.0 release](https://newreleases.io/project/github/withastro/astro/release/@astrojs/cloudflare@13.0.0)
19. [Astro 6 + Cloudflare static output build failure report](https://github.com/withastro/astro/issues/15650)
20. [Eleventy is now Build Awesome — 11ty blog](https://www.11ty.dev/blog/build-awesome/)
21. [Cloudflare Images pricing](https://developers.cloudflare.com/images/pricing/)
22. [Cloudflare Plans overview](https://www.cloudflare.com/plans/)
23. [HEIF/HEIC support — caniuse](https://caniuse.com/heif)
24. [sharp HEIC support issue — lovell/sharp#3680](https://github.com/lovell/sharp/issues/3680)
25. [WebP support — caniuse](https://caniuse.com/webp) *(not fetched directly — version claim is based on general-knowledge summary; uncertain — verify at implementation time)*
26. [Minimal CSS-only blurry image placeholders — Lean Rada](https://leanrada.com/notes/css-only-lqip/)
27. [Formspree Pricing & Plans (SaaSworthy, April 2026)](https://www.saasworthy.com/product/formspree-io/pricing)
28. [Tally Alternatives 2026 — DEV.to](https://dev.to/allenarduino/tally-alternatives-in-2026-for-developers-who-need-a-form-backend-not-just-a-builder-3955)
29. [How to Call Google Cloud APIs From Cloudflare Workers — Hookdeck](https://hookdeck.com/blog/how-to-call-google-cloud-apis-from-cloudflare-workers) and [streamwall/sheet2json-worker](https://github.com/streamwall/sheet2json-worker), [shreyvarshney1/sheetsync-cloud](https://github.com/shreyvarshney1/sheetsync-cloud)
30. [Core Web Vitals 2026 thresholds — web.dev & corewebvitals.io](https://www.corewebvitals.io/core-web-vitals)
31. [WCAG 2.2 Is Now an ISO Standard — adaquickscan.com](https://adaquickscan.com/blog/wcag-2-2-iso-standard-2025)
32. [ADA Title II 2026 Update — aberdeen.io](https://aberdeen.io/blog/2026/04/07/ada-title-iis-2026-update-what-changed-and-what-didnt/)
33. [Cloudflare Turnstile GA announcement](https://blog.cloudflare.com/turnstile-ga/)
34. [Rate limiting rules — Cloudflare WAF docs](https://developers.cloudflare.com/waf/rate-limiting-rules/)
35. General search for festival/unconference case studies on Cloudflare Pages produced no directly-comparable public references (searched 2026-04-18).
36. [How We Secured Our Next.js Forms — Websyro Agency](https://www.websyro.com/blogs/secure-form-stack-rate-limit-turnstile-honeypot-spam-detection-logging)
37. [Cloudflare Email Routing docs](https://developers.cloudflare.com/email-routing/)
