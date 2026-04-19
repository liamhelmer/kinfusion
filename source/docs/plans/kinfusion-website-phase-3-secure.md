# Phase-3 Security Review — kinfusion-website

**Scope:** Phase-3 BRAINS implementation artefacts  
**Date:** 2026-04-18  
**Council:** gemini-3.1-pro + gpt-5.4 (star-chamber parallel review)

---

## Findings and Resolutions

### HIGH — production.yml: deploy conditional always false

**File:** `.github/workflows/production.yml:53`  
**Finding:** `if: ${{ env.CF_API_TOKEN != '' }}` — GitHub Actions evaluates `if` conditionals before step-level `env` is injected, so this expression always evaluated to `false`. All production deploys were silently skipped.  
**Fix:** Changed to `if: ${{ secrets.CF_API_TOKEN != '' }}` (direct secret reference). Applied to both the deploy step and the skip step.  
**Status:** Fixed.

---

### HIGH — retention.js: no LockService around idempotency check

**File:** `source/apps-script/retention.js:31`  
**Finding:** Time-driven triggers can overlap or be manually invoked while a scheduled run is in-progress. Because `RETENTION_COMPLETED_AT` was written at the end, two concurrent executions could both pass the pre-lock idempotency check, both execute archive+delete, and both attempt to send email.  
**Fix:** Added `LockService.getScriptLock().waitLock(30000)` wrapping the critical section. A fast-path pre-lock check avoids unnecessary lock contention on post-completion runs. After acquiring the lock, the idempotency property is re-checked before proceeding.  
**Status:** Fixed.

---

### HIGH — retention.js: completion marker written after notification

**File:** `source/apps-script/retention.js:84`  
**Finding:** `RETENTION_COMPLETED_AT` was written after `GmailApp.sendEmail()`. If notification threw an exception, the marker would never be written despite PII having already been deleted — causing the trigger to re-execute on the next daily run against now-empty sheets.  
**Fix:** `props.setProperty(RETENTION_COMPLETED_PROP, archiveTimestamp)` is now written immediately after archive+delete, before the `finally` block releases the lock. Email notification is wrapped in a separate `try/catch` outside the lock, treated as best-effort. A notification failure is logged but does not prevent completion from being recorded.  
**Status:** Fixed.

---

### MEDIUM — backup.js: silent return on export failure

**File:** `source/apps-script/backup.js:37`  
**Finding:** `if (response.getResponseCode() !== 200) { return; }` silently swallowed export failures. The trigger would report success to Apps Script despite no backup being created.  
**Fix:** Changed to `throw new Error(...)`. The exception propagates out of the `finally` block, causing the trigger execution to be marked as failed in Apps Script's execution log and Stackdriver, enabling alerting.  
**Status:** Fixed.

---

### MEDIUM — backup.js: no LockService around existence check + file creation

**File:** `source/apps-script/backup.js:22`  
**Finding:** Concurrent backup trigger executions could both pass the `getFilesByName()` existence check before either had created the file, resulting in duplicate backup files.  
**Fix:** Added `LockService.getScriptLock().waitLock(30000)` wrapping the existence check and file creation. The `finally` block releases the lock in all paths.  
**Status:** Fixed.

---

### LOW — appsscript.json: missing explicit oauthScopes

**File:** `source/apps-script/appsscript.json`  
**Finding:** No `oauthScopes` declared. Apps Script auto-detects scopes from source, but `UrlFetchApp.fetch()` with a Bearer token to export Drive files requires `https://www.googleapis.com/auth/drive`. Auto-detection can miss this in some deployment paths.  
**Fix:** Added explicit `oauthScopes` array covering spreadsheets, drive, gmail.send, script.external_request, and script.scriptapp.  
**Status:** Fixed.

---

### LOW — installBackupTrigger: missing timezone note

**File:** `source/apps-script/backup.js:51`  
**Finding:** No note that the trigger fires in the project timezone, not necessarily UTC. Operators could miscalculate the backup window.  
**Fix:** Added a JSDoc note mirroring the existing note in `installRetentionTrigger`.  
**Status:** Fixed.

---

## Files Modified

| File | Changes |
|---|---|
| `.github/workflows/production.yml` | Fix deploy/skip conditionals: `env.CF_API_TOKEN` → `secrets.CF_API_TOKEN` |
| `source/apps-script/retention.js` | Add LockService; move completion marker before notification; best-effort email |
| `source/apps-script/backup.js` | Add LockService; throw on export failure; timezone note |
| `source/apps-script/appsscript.json` | Add explicit oauthScopes |

---

## No-Finding Items

- **gateway.js HMAC + replay protection**: Correct. HMAC key loaded from env, replay window enforced via KV TTL.
- **LockService in gateway.js**: Not applicable — Worker handles concurrency via V8 isolate model, not Apps Script triggers.
- **No-payment-data CI grep**: Word-boundary patterns correct. Searches full tree excluding node_modules and _site.
- **Axe + LHCI CI steps**: Server readiness polling, trap EXIT cleanup, and exit-code propagation all correct.
- **Playwright PLAYWRIGHT_BASE_URL hard-require**: Correct; production deploy blocked without it per ADR R10.1.
- **retention.js deleteRows race**: Pre-captured counts correctly used; no regression.
- **retention.js idempotency property key**: `RETENTION_COMPLETED_AT` stored in Script Properties (not Document Properties), scoped correctly.
