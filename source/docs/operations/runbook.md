# Kin-Fusion Campout Website — Operations Runbook

**Site:** kinfusion.dance  
**Stack:** Eleventy 3.1 + Cloudflare Worker + Static Assets + Google Apps Script

---

## Branch Protection (main)

The `main` branch is protected. Before merging a PR to `main`:
- At least 1 reviewer must approve
- All CI checks (build, preview deploy) must pass
- The `production.yml` workflow will deploy automatically on merge

To configure in GitHub: Settings → Branches → Branch protection rules → Add rule for `main`.

---

## Secret Rotation

### TURNSTILE_SECRET

1. Go to Cloudflare Dashboard → Turnstile → the kinfusion.dance widget
2. Click "Rotate Secret Key"
3. Copy the new secret
4. Run: `cd source && wrangler secret put TURNSTILE_SECRET`
5. Verify the form works end-to-end (T-1.10 smoke steps)

### APPS_SCRIPT_HMAC_KEY

1. Generate new key: `openssl rand -hex 32`
2. Run: `cd source && wrangler secret put APPS_SCRIPT_HMAC_KEY`
3. Update the Apps Script Script Property `HMAC_KEY` to match: Apps Script editor → Project settings → Script properties
4. Test form submission end-to-end before declaring complete

### APPS_SCRIPT_URL

1. Create a new deployment in Apps Script editor → Deploy → New deployment
2. Copy the new Web App URL
3. Run: `cd source && wrangler secret put APPS_SCRIPT_URL`
4. Old deployments can be left active temporarily until new one is verified

---

## Apps Script Redeploy

```bash
cd source/apps-script
clasp login     # if not already authenticated
clasp push      # push source files
clasp deploy    # create new deployment
```

After deploying, update `APPS_SCRIPT_URL` secret (see above).

---

## Turnstile Key Rotation

1. Cloudflare Dashboard → Turnstile → kinfusion.dance widget
2. Click "Rotate" (or add a new sitekey)
3. Update `src/_data/site.json` (or equivalent) with the new public sitekey
4. Update the secret via `wrangler secret put TURNSTILE_SECRET`
5. Deploy via push to `brains/kinfusion-website` (triggers preview deploy)
6. Verify Turnstile widget appears and passes

---

## Sheet Restore from Backup

Weekly backups are created by the `backup.js` Apps Script trigger (every Sunday).

1. Go to the organizer's Google Drive → find the most recent `KinFusion-Backup-YYYY-MM-DD.xlsx` file
2. Create a new Google Sheet from this backup
3. If the operational sheet is corrupted: delete it and recreate using the backup
4. Update `SHEET_ID` Script Property in the Apps Script to point to the new sheet
5. Test form submission end-to-end

---

## Incident Escalation Contacts

- **Site owner / primary:** Liam Helmer — liam.helmer@gmail.com
- **Event organizer:** hello@kinfusion.dance

---

## DNS Emergency

If `kinfusion.dance` becomes unreachable:

1. Log into Cloudflare Dashboard (cloudflare.com) with the site owner credentials
2. DNS → verify the A/CNAME records pointing to Workers
3. If nameservers were changed, restore them at the domain registrar to Cloudflare's nameserver pair
4. The preview URL (`*.workers.dev`) is always available as a fallback

---

## Post-Event 90-Day Retention Delete (2026-12-12)

Per ADR R8.2, personal data in the operational Google Sheet must be deleted by **2026-12-12** (90 days after event end 2026-09-13).

The `retention.js` Apps Script trigger handles this automatically:
- Daily trigger fires after 2026-12-12
- Archives aggregate counts (no PII) to `KinFusion-2026-Archive` sheet
- Deletes rows from operational sheets
- Sends notification email to organizer

Manual verification: check the Archive sheet on or after 2026-12-12 to confirm deletion ran. If not: open Apps Script editor → Triggers → verify daily trigger is active.

---

## Email Routing Setup (Cloudflare)

Configure in Cloudflare Dashboard → Email → Email Routing:

1. Enable Email Routing for `kinfusion.dance`
2. Add forwarding rules:
   - `hello@kinfusion.dance` → organizer Gmail
   - `info@kinfusion.dance` → organizer Gmail
   - Catch-all (`*@kinfusion.dance`) → organizer Gmail
3. Cloudflare auto-creates MX and SPF records — verify they appear in DNS tab

**Note:** Email Routing is receive-and-forward only. Confirmation emails are sent via GmailApp from the organizer's Gmail address, with `Reply-To: hello@kinfusion.dance`.

---

## Security Non-Goals (ADR R12)

Per the architecture decision:
- The site does NOT process payments on-site
- No payment card data, bank routing numbers, or CVV data are collected or stored
- Payment occurs out-of-band via Interac e-transfer or Wyse, per organizer instructions to accepted applicants
- The Apps Script Web App URL is never exposed to clients; only the Worker holds it
- Detailed internal errors are never surfaced to clients — only generic error codes

---

## Pre-Launch Drill (R10.5)

Before going live at kinfusion.dance:
1. Submit test registration at `https://kinfusion.dance/register/` with test data
2. Verify row appears in production Google Sheet (Registrations tab)
3. Verify confirmation email arrives in organizer inbox (not spam)
4. Verify refCode in email matches refCode in sheet row
5. Run Playwright E2E suite against production URL
6. Check Worker tail log for structured JSON success events
