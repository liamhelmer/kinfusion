# Kin-Fusion Campout — project notes for Claude

## Deploys

### Cloudflare Worker
```bash
ELEVENTY_ENV=preview    npm run build && wrangler deploy --env preview
ELEVENTY_ENV=production npm run build && wrangler deploy --env production
```

### Apps Script (staging + production)
```bash
bash scripts/push-apps-script.sh staging
bash scripts/push-apps-script.sh production
```

## `gws` re-auth

Apps Script pushes use `gws` against the Google Apps Script API. The API
requires the caller to hold every scope declared in
`apps-script/appsscript.json` — `gws auth login` alone does NOT request these.

When a push fails with `Request had insufficient authentication scopes` or
`Token has been expired or revoked`, run:

```bash
bash scripts/reauth-gws.sh
```

The script:
1. Clears `~/.config/gws/token_cache.json` (a stale cache there is the most
   common cause of "insufficient scopes" *after* a successful re-auth — the
   refresh-token gets new scopes but the cached access-token is still the
   old narrower one).
2. Requests the full scope list including `script.*` family.
3. Captures the OAuth URL to `/tmp/gws-auth-url.txt`, prints it inside a
   code block (avoids terminal word-wrap mangling), and auto-opens it via
   `xdg-open`/`open`.

After the browser flow completes, the next `push-apps-script.sh` run
succeeds.

Identity must be `kinfusion.campout@gmail.com`. Verify with `gws auth status`.

## Spreadsheet IDs (live, in PropertiesService — not in source)

- Staging Sheet: `127ZrKsAi7n-tQteMW0lw1wMgunJm7tDFlGIvmQHCPgo`
- Production Sheet: `1tBLlMDSKmWAmyO1pqg5vyesUMapdQnrGBgO9ZqEac3Q`

The `apps-script/setupProperties.js` file's hardcoded `SHEET_ID` is the
*template* used at script-property-set time; live values may differ if the
PropertiesService was updated separately. Stand-alone column additions on
existing tabs are idempotent under the updated `setupSpreadsheet()` — it
appends any headers beyond the current width without touching existing
cells.

## Schema additions, in column order

- **Registrations**: `…Notes, Donation, RVLength, AdultAllergies, FridgeSpace, IsYouth13to18, GuardianNames, KidsAgreementsAccepted` (29 cols total)
- **Children**: `Timestamp, ParentRefCode, ParentName, ParentEmail, ParentPhone, ChildName, ChildAge, ChildRelationship, ChildDietary, ChildAllergies, ChildAlternateParents` (11 cols)
- **DJSignups**: `…Links, Notes, ExperienceLevel` (12 cols)

## Test fixtures

The worker test fixtures (`worker/tests/*.test.js`) require `leavingDay` on
registration payloads or validation rejects them. Older fixtures without
`leavingDay` will fail.

## Common gotchas

- `apps-script/handlers/shared.js::buildRegistrationEmailHtml` MUST set every
  template variable referenced by `register-confirmation.html`. A missing
  `template.X` causes the scriptlet `<?= X ?>` to throw, which is silently
  swallowed by the `MailApp.sendEmail` try/catch — registrations write to the
  sheet but no email is sent.
- Apps Script versions are independent per env — staging and production
  deploy IDs are tracked in `scripts/apps-script-ids.sh`.
