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
| Worker fetch handler | `source/worker/index.js` | Routes `/api/*` to stub handlers (Phase 2); all other paths to ASSETS binding. Returns `/404.html` on 404. | Cloudflare Workers runtime | Y |

---

## 3. External Integrations (Facades)

| Facade Name | File Path | Wrapped Library/API | Purpose |
| :--- | :--- | :--- | :--- |
| Eleventy Image | `source/.eleventy.js` | `@11ty/eleventy-img@6.0.0` | Responsive image generation with AVIF/WebP/JPEG output |
| Cloudflare ASSETS | `source/worker/index.js` | `env.ASSETS.fetch()` | Static asset serving via Cloudflare Workers Static Assets binding |
| GitHub Actions CI | `.github/workflows/preview.yml`, `production.yml` | GitHub Actions + Wrangler 4 | Preview deploy on non-main branches; production deploy on main |

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
