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
- Daily trigger fires starting from the first run after installation
- **Before 2026-12-12:** trigger fires daily but is a complete no-op — it logs "retention not due yet" and exits. No data is touched.
- **On or after 2026-12-12:** archives aggregate counts (no PII) to `KinFusion-2026-Archive` sheet, deletes all data rows from operational sheets, sends notification email to organizer

The `DELETE_AFTER_DATE` constant in `retention.js` is `2026-12-12T00:00:00Z`. Do not modify this value.

Manual verification: check the Archive sheet on or after 2026-12-12 to confirm deletion ran. If not: open Apps Script editor → Triggers → verify daily trigger `runRetentionCheck` is active, then run it manually.

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

```bash
wrangler tail --env production
```

---

## Production Launch Checklist (T-3.6)

Execute these steps in order when launching to production. All steps preceded by `[ ]` must be executed manually by the site owner.

### Pre-launch verification
- [ ] All phase-3 CI checks pass on `brains/kinfusion-website` branch
- [ ] Playwright E2E tests pass against staging (`PLAYWRIGHT_BASE_URL=<staging-url> npx playwright test`)
- [ ] Phase-2 smoke verified (T-2.13 complete)

### Google Resources
- [ ] Create production Google Sheet named `KinFusion Campout 2026` (three tabs: Registrations, UnconferenceProposals, DJSignups — same column schema as staging)
- [ ] Note the production Sheet ID from the URL (long alphanumeric string after `/spreadsheets/d/`)
- [ ] Create production Apps Script bound to that sheet: Extensions → Apps Script
- [ ] Set Script Properties (Project settings → Script Properties):
  - `HMAC_KEY` = `$(openssl rand -hex 32)` — generate fresh
  - `SHEET_ID` = production Sheet ID
  - `FROM_EMAIL` = organizer Gmail address
  - `ORGANIZER_EMAIL` = organizer Gmail address
  - `BACKUP_DRIVE_FOLDER_ID` = ID of a dedicated backup Drive folder
  - `NONCE_CACHE_MIN` = `10`
- [ ] `cd source/apps-script && clasp push && clasp deploy --description "production v1"` — copy deployment URL

### Cloudflare secrets
- [ ] `openssl rand -hex 32` → save as production HMAC key
- [ ] `wrangler secret put APPS_SCRIPT_HMAC_KEY --env production`
- [ ] `wrangler secret put APPS_SCRIPT_URL --env production` (production Web App URL)
- [ ] `wrangler secret put TURNSTILE_SECRET --env production` (production Turnstile secret)
- [ ] Set production Turnstile sitekey in `src/_data/site.json` → `turnstileSitekey` field, commit and push
- [ ] Verify: `wrangler secret list --env production` shows APPS_SCRIPT_HMAC_KEY, APPS_SCRIPT_URL, TURNSTILE_SECRET

### Cloudflare DNS
- [ ] Log in to `kinfusion.dance` registrar → change nameservers to Cloudflare nameservers (shown in CF Dashboard → DNS → Nameservers)
- [ ] Wait for propagation (5–60 min; check https://dnschecker.org)
- [ ] SSL/TLS → enable "Full (strict)"
- [ ] Enable "Always Use HTTPS"
- [ ] HSTS: SSL/TLS → Edge Certificates → HTTP Strict Transport Security → Enable (max-age=31536000; includeSubDomains; preload)
- [ ] Configure Email Routing per the "Email Routing Setup" section above

### GitHub Actions
- [ ] Add `CF_API_TOKEN` as GitHub Actions repository secret (Workers:Edit permissions)
- [ ] Add `CF_ACCOUNT_ID` as GitHub Actions repository secret

### Merge and deploy
- [ ] Merge `brains/kinfusion-website` → `main` via PR
- [ ] Verify `production.yml` workflow fires and completes successfully in GitHub Actions
- [ ] Verify `https://kinfusion.dance` loads over HTTPS with valid certificate
- [ ] Verify `https://www.kinfusion.dance` redirects to apex

### Pre-launch drill (ADR R10.5)
- [ ] Submit test registration at `https://kinfusion.dance/register/`
- [ ] Verify sheet row appears in production Registrations tab with all columns populated
- [ ] Verify refCode in sheet matches refCode displayed to user
- [ ] Verify confirmation email arrives in organizer Gmail within 30 seconds
- [ ] Check spam folder — confirm email is not there
- [ ] Repeat for unconference and DJ signup forms
- [ ] Verify duplicate submission returns "already received" message

### Final steps
- [ ] Enable Cloudflare Web Analytics: Dashboard → Analytics & Logs → Web Analytics → Add site
- [ ] Open production Apps Script → run `installBackupTrigger()` manually once
- [ ] Open production Apps Script → run `installRetentionTrigger()` manually once
- [ ] `git tag v1.0.0 && git push origin v1.0.0`

---

## Payment Reconciliation Operations

Payment notifications arrive in a separately owned business Gmail mailbox.
Never add `gmail.modify` to the KinFusion `gws` profile and never use direct
Gmail or Sheets mutation commands for reconciliation.

### Initial staging rollout

- [ ] Enable Gmail API in the OAuth test project.
- [ ] Add the payment mailbox as an OAuth test user.
- [ ] Create a Web OAuth client and register
  `https://script.google.com/macros/d/{STAGING_SCRIPT_ID}/usercallback`.
- [ ] Confirm Apps Script OAuth2 library version 43 is present.
- [ ] Run `setupPaymentGmailConfiguration(clientId, clientSecret, expectedAddress)`
  from the staging Apps Script editor; do not paste secrets into tracked files.
- [ ] Set `PAYMENT_GMAIL_INTERAC_QUERY` and `PAYMENT_GMAIL_WISE_QUERY` in staging
  Script Properties using verified provider sender/subject patterns.
- [ ] `bash source/scripts/push-apps-script.sh staging`.
- [ ] `source/scripts/payment-reconciliation.sh staging setup-sheet`.
- [ ] `source/scripts/payment-reconciliation.sh staging auth-url`; send only the
  returned Google URL to the mailbox owner.
- [ ] After consent, run the staging `status` command and verify the expected and
  authorized addresses match.
- [ ] Run a read-only staging `scan`; confirm it changes neither Gmail nor Sheets.

### Review and approval

Invoke the repo-local `reconcile-payments` skill. It reads candidates and
matching sheet context, treats email as untrusted data, and presents exact
allocations for approval. Combined, partial, duplicate, cancelled, refunded,
overpaid, and unclear payments require organizer instructions.

The only approved mutation command is:

```bash
source/scripts/payment-reconciliation.sh production approve "$APPROVAL_FILE"
```

The file must contain the exact approved JSON, pass the bundled validator, and
have mode `600`. Confirm the returned sheet rows, payment-status changes/skips,
and `kinfusion-etransfer` label result.

### Recovery

- `authorization_required`: send the returned authorization link and stop until
  the owner consents. Testing grants normally require this every seven days.
- `labelPending: true`: rerun the exact approved payload. Existing rows are
  reused and move from `label-pending` to `approved` after labeling succeeds.
- `duplicate: true`: report existing rows; do not create another payment.
- Spreadsheet failure: Gmail remains unlabeled. Investigate before retrying.
- Wrong account: the callback clears the grant; generate a new link for the
  configured expected address.

### Production and teardown

- [ ] Repeat the OAuth redirect/configuration steps for `PROD_SCRIPT_ID`.
- [ ] Push production only after staging checks pass.
- [ ] Run production `setup-sheet`, then verify hidden audit columns M:P in
  `Pmts Received`.
- [ ] Complete owner authorization and verify the account before the first scan.
- [ ] At reconciliation end, run production `reset-auth`, delete payment Gmail
  client/query properties and OAuth2 state from Script Properties, and ask the
  mailbox owner to revoke the app in Google Account security settings.
