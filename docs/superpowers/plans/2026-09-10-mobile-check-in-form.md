# Mobile Check-In Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a secure, mobile-first `/check-in/` form with a non-persisted drawn-signature interaction and printable QR assets.

**Architecture:** Extend the existing Eleventy → Cloudflare Worker → HMAC-signed Apps Script → Google Sheet form pipeline with a `check-in` form type. Keep signature pixels entirely in the browser and submit only a boolean completion flag. Generate static SVG and PNG QR assets plus a printable page for the canonical production URL.

**Tech Stack:** Eleventy 3.1.5, browser Pointer Events and Canvas APIs, Cloudflare Workers, Vitest, Google Apps Script V8, Google Sheets, Playwright/Chrome, `qrcode` for build-time QR generation.

**Spec:** `docs/superpowers/specs/2026-09-10-mobile-check-in-form-design.md`

## Global Constraints

- The canonical form URL is exactly `https://kinfusion.dance/check-in/`.
- The signature bitmap, vector points, and stroke coordinates must never be transmitted, logged, or stored.
- Store phone numbers exactly as entered; accept international formatting characters.
- Store a server timestamp as authoritative and the browser-local `YYYY-MM-DD` date as informational.
- Save rows to a new `Check-In` tab in the existing spreadsheet and send no confirmation email.
- Check-in data uses the existing December 12, 2026 retention deadline and deletion-contact language.
- Preserve all existing form routes and security middleware.

## File Map

- `source/worker/validation.js`: exports `validateCheckIn(body)`.
- `source/worker/index.js`: maps `POST /api/check-in` to the shared secure submission pipeline.
- `source/worker/tests/validation.test.js`: check-in schema unit tests.
- `source/worker/tests/index.test.js`: route-level forwarding and validation tests.
- `source/apps-script/handlers/check-in.js`: appends validated check-in rows without sending email.
- `source/apps-script/gateway.js`: dispatches the `check-in` form type.
- `source/apps-script/setupProperties.js`: declares the `Check-In` tab and exact headers.
- `source/apps-script/retention.js`: includes `Check-In` in the existing retention workflow.
- `source/apps-script/tests/checkIn.test.js`: Apps Script handler and dispatch tests with service stubs.
- `source/src/check-in/index.njk`: accessible mobile check-in form.
- `source/src/check-in/print.njk`: printable QR handout.
- `source/src/js/signature-pad.js`: isolated pointer/canvas state controller.
- `source/src/js/check-in.js`: date initialization, signature validation, and shared form submission setup.
- `source/src/css/main.css`: signature-pad and printable-handout styles.
- `source/src/assets/check-in-qr.svg`: generated scalable QR code.
- `source/src/assets/check-in-qr.png`: generated high-resolution QR code.
- `source/scripts/generate-check-in-qr.mjs`: deterministic QR asset generator.
- `source/scripts/tests/check-in-page.test.mjs`: built-page and privacy-boundary tests.
- `source/scripts/tests/check-in-qr.test.mjs`: QR target and print-page tests.
- `source/package.json` and lockfile: QR generation dependency and script.

---

### Task 1: Worker validation and route

**Files:**
- Modify: `source/worker/validation.js`
- Modify: `source/worker/index.js`
- Modify: `source/worker/tests/validation.test.js`
- Create: `source/worker/tests/index.test.js`

**Interfaces:**
- Consumes: existing `handleFormSubmission(request, env, formName)` pipeline.
- Produces: `validateCheckIn(body): { valid: true } | { valid: false, field: string, code: 'VALIDATION' }` and `POST /api/check-in`.

- [ ] **Step 1: Add failing validator tests**

Add cases importing `validateCheckIn` that accept:

```js
{
  attendeeName: 'Smoke Test Attendee',
  attendeePhone: '+1 (250) 555-0100',
  localDate: '2026-09-10',
  emergencyContactName: 'Emergency Person',
  emergencyContactPhone: '+1 250 555 0101',
  codeOfConductInitials: 'STA',
  signatureCompleted: true,
}
```

Reject each missing required field, names over 100 characters, phones over 50 characters, initials over 12 characters, malformed dates such as `09/10/2026`, and every signature value other than the boolean `true`.

- [ ] **Step 2: Run the validator tests and confirm the missing export fails**

Run: `cd source && npx vitest run worker/tests/validation.test.js`

Expected: FAIL because `validateCheckIn` is not exported.

- [ ] **Step 3: Implement `validateCheckIn`**

Use the existing `checkRequired` and `checkLength` helpers. Validate `localDate` with `/^\d{4}-\d{2}-\d{2}$/` and require `signatureCompleted === true`; do not normalize phone values.

- [ ] **Step 4: Add a failing route test**

Test that `POST /api/check-in` enters the shared pipeline, invokes HMAC forwarding with `form: 'check-in'`, strips `formToken`, Turnstile response, and honeypot fields, and returns the forwarded reference code. Add a rejection case proving validation runs before forwarding.

- [ ] **Step 5: Register the route and validator**

Import `validateCheckIn`, add it to `VALIDATORS.check-in`, add `handleCheckIn`, and map `POST /api/check-in` in `API_ROUTES`.

- [ ] **Step 6: Run focused Worker tests**

Run: `cd source && npx vitest run worker/tests/validation.test.js worker/tests/index.test.js`

Expected: PASS.

- [ ] **Step 7: Commit the Worker slice**

```bash
git add source/worker/validation.js source/worker/index.js source/worker/tests/validation.test.js source/worker/tests/index.test.js
git commit -m "feat: add check-in API validation"
```

### Task 2: Apps Script sheet handler

**Files:**
- Create: `source/apps-script/handlers/check-in.js`
- Modify: `source/apps-script/gateway.js`
- Modify: `source/apps-script/setupProperties.js`
- Modify: `source/apps-script/retention.js`
- Create: `source/apps-script/tests/checkIn.test.js`

**Interfaces:**
- Consumes: signed payload with the seven validated public fields and existing `generateRefCode_()`.
- Produces: `handleCheckIn_(payload): { ok: true, refCode: string } | { ok: false, code: string }` and a nine-column `Check-In` row.

- [ ] **Step 1: Write failing handler tests**

Stub `PropertiesService`, `SpreadsheetApp`, and `generateRefCode_`. Assert the appended row is exactly:

```js
[
  '<server ISO timestamp>', 'KF-TEST01', '2026-09-10',
  'Smoke Test Attendee', '+1 (250) 555-0100',
  'Emergency Person', '+1 250 555 0101', 'STA', true,
]
```

Assert `SHEET_ID` missing returns `MISCONFIGURED`, a missing `Check-In` tab returns `SHEET_NOT_FOUND`, and no mail service is invoked.

- [ ] **Step 2: Run and confirm the handler test fails**

Run: `cd source && npx vitest run apps-script/tests/checkIn.test.js`

Expected: FAIL because the handler does not exist.

- [ ] **Step 3: Implement `handleCheckIn_`**

Open the spreadsheet from `SHEET_ID`, obtain `Check-In`, generate the reference and server ISO timestamp, append the exact ordered row, log only the reference code, and return success. Do not read `FROM_EMAIL` or call `MailApp`.

- [ ] **Step 4: Register dispatch, sheet headers, and retention**

Add `case 'check-in': return handleCheckIn_(payload);`. Add a `Check-In` setup entry with headers:

```js
['Timestamp', 'RefCode', 'LocalDate', 'AttendeeName', 'AttendeePhone',
 'EmergencyContactName', 'EmergencyContactPhone', 'CodeOfConductInitials',
 'SignatureCompleted']
```

Add `Check-In` to the operational tabs deleted by the existing retention job.

- [ ] **Step 5: Run focused Apps Script tests**

Run: `cd source && npx vitest run apps-script/tests/checkIn.test.js apps-script/tests/retention.test.js`

Expected: PASS.

- [ ] **Step 6: Commit the storage slice**

```bash
git add source/apps-script/handlers/check-in.js source/apps-script/gateway.js source/apps-script/setupProperties.js source/apps-script/retention.js source/apps-script/tests/checkIn.test.js
git commit -m "feat: store attendee check-ins"
```

### Task 3: Mobile form and non-persisted signature pad

**Files:**
- Create: `source/src/check-in/index.njk`
- Create: `source/src/js/signature-pad.js`
- Create: `source/src/js/check-in.js`
- Modify: `source/src/css/main.css`
- Create: `source/scripts/tests/check-in-page.test.mjs`

**Interfaces:**
- Consumes: `initForm(form, config)` from `form-handler.js` and `POST /api/check-in`.
- Produces: `createSignaturePad(canvas, options)` returning `{ clear(), isSigned(), resize() }`; submitted body contains `signatureCompleted: true` and no drawing data.

- [ ] **Step 1: Add failing built-page assertions**

After an Eleventy build, assert `/check-in/index.html` contains all required field names, the exact Code of Conduct sentence/link, a canvas and Clear button, the privacy statement, Turnstile markup, and `/js/check-in.js`. Assert it contains no hidden signature image or data field.

- [ ] **Step 2: Run the site test and confirm it fails**

Run: `cd source && npm run build && node --test --test-name-pattern="check-in" scripts/tests/check-in-page.test.mjs`

Expected: FAIL because the page has not been created.

- [ ] **Step 3: Create the accessible form template**

Use required inputs named `attendeeName`, `attendeePhone`, `localDate`, `emergencyContactName`, `emergencyContactPhone`, and `codeOfConductInitials`. Make `localDate` read-only. Include the exact approved agreement, privacy/retention notice, signature instructions, canvas, Clear button, signature error status, shared form status, honeypot, Turnstile, and submit button.

- [ ] **Step 4: Write signature-controller unit tests**

Test these public behaviors with a stub canvas context and PointerEvent objects: untouched is false; a down/move/up stroke makes `isSigned()` true; `clear()` resets false; pointer-down without movement remains false; `resize()` preserves signed state only when the bitmap can be copied and otherwise resets it.

- [ ] **Step 5: Implement `createSignaturePad`**

Use pointer capture, device-pixel-ratio canvas sizing, rounded dark strokes, and `touch-action: none` only on the canvas. Keep stroke coordinates inside the module and expose no serialization method.

- [ ] **Step 6: Implement check-in form initialization**

Set `localDate` using local date components rather than UTC conversion. On submit, reject an unsigned pad with an accessible error and focus the canvas. Use `transformBody` to add only `signatureCompleted: true`; explicitly delete any unexpected signature-like keys. On success, replace the form with “You’re checked in” and the escaped reference code.

- [ ] **Step 7: Add mobile-focused styles**

Give the canvas a visible border, white background, full available width, 160px CSS height, and clear focus/error states. Make the Clear and Submit controls at least 44px high. Add a narrow content width suitable for fast on-site entry.

- [ ] **Step 8: Run client and site tests**

Run: `cd source && npx vitest run && npm run test:site`

Expected: PASS.

- [ ] **Step 9: Commit the client slice**

```bash
git add source/src/check-in/index.njk source/src/js/signature-pad.js source/src/js/check-in.js source/src/css/main.css source/scripts/tests/check-in-page.test.mjs
git commit -m "feat: add mobile check-in form"
```

### Task 4: QR and printable assets

**Files:**
- Modify: `source/package.json`
- Modify: `source/package-lock.json`
- Modify: `source/.eleventy.js`
- Create: `source/scripts/generate-check-in-qr.mjs`
- Create: `source/src/assets/check-in-qr.svg`
- Create: `source/src/assets/check-in-qr.png`
- Create: `source/src/check-in/print.njk`
- Create: `source/scripts/tests/check-in-qr.test.mjs`

**Interfaces:**
- Consumes: canonical URL constant `https://kinfusion.dance/check-in/`.
- Produces: deterministic QR assets and `/check-in/print/` handout.

- [ ] **Step 1: Install and script the QR generator**

Run: `cd source && npm install --save-dev qrcode jsqr pngjs`

Add `generate:check-in-qr` to `package.json`. The generator calls `QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'H', margin: 4 })` and `QRCode.toFile(..., { width: 1600, errorCorrectionLevel: 'H', margin: 4 })`.

- [ ] **Step 2: Add failing QR tests**

Assert both assets exist, SVG declares a viewBox and encoded modules, PNG dimensions are 1600×1600, and the print page references the SVG plus the exact written canonical URL. Decode the PNG with `pngjs` and `jsqr`, then assert the result equals the canonical URL.

- [ ] **Step 3: Generate assets and create the print page**

Run: `cd source && npm run generate:check-in-qr`. Add `src/assets` as passthrough copy, then create a minimal print layout with “Kin-Fusion Check-In”, scanning instruction, QR image, and written URL. Add `@media print` CSS that hides site navigation/footer and fits the handout on one page.

- [ ] **Step 4: Run QR and build tests**

Run: `cd source && npm run generate:check-in-qr && npm run build && node --test scripts/tests/check-in-qr.test.mjs`

Expected: PASS and generated assets copied to `_site/assets/`.

- [ ] **Step 5: Commit QR deliverables**

```bash
git add source/package.json source/package-lock.json source/.eleventy.js source/scripts/generate-check-in-qr.mjs source/src/assets/check-in-qr.svg source/src/assets/check-in-qr.png source/src/check-in/print.njk source/scripts/tests/check-in-qr.test.mjs source/src/css/main.css
git commit -m "feat: add printable check-in QR code"
```

### Task 5: Full verification, production deployment, and smoke submission

**Files:**
- Modify if needed: `source/MANIFEST.md`
- Create: `source/scripts/smoke-test-check-in.sh`

**Interfaces:**
- Consumes: completed form route, Worker endpoint, production Apps Script deployment, and generated assets.
- Produces: verified production page and one clearly labeled Google Sheet smoke row.

- [ ] **Step 1: Add the new public interfaces to the manifest**

Document `/check-in/`, `/api/check-in`, the check-in browser module, signature pad, Apps Script handler, and QR generator/assets.

- [ ] **Step 2: Add a non-interactive smoke script**

Model it on existing smoke scripts. It obtains a form token, posts a `Smoke Test Attendee` payload with the configured test Turnstile token, requires `ok: true` and a reference code, then verifies an incomplete payload returns `VALIDATION` without printing secrets.

- [ ] **Step 3: Run all local quality gates**

Run:

```bash
cd source
npm run generate:check-in-qr
npm test
git diff --check
```

Expected: all Vitest and Node tests pass, Eleventy builds, and the diff check is empty.

- [ ] **Step 4: Push and deploy Apps Script production code**

Run `cd source && bash scripts/push-apps-script.sh production`, create a new Apps Script version, and update the existing production web-app deployment to that version. Run `setupSpreadsheet` through the authenticated controller path so `Check-In` exists before accepting submissions. Verify the public Apps Script URL returns the expected non-POST response rather than HTTP 403.

- [ ] **Step 5: Deploy the Cloudflare Worker and static assets**

Run: `cd source && npx wrangler deploy --env production`

Record the deployed Worker version ID.

- [ ] **Step 6: Perform the phone-sized Chrome smoke test**

At a 390×844 viewport, open `https://kinfusion.dance/check-in/`, verify no page errors, confirm today's local date, fill every field, draw and clear once, redraw, complete Turnstile, and submit. Require the “You’re checked in” confirmation and reference code. Verify neither the request payload nor network log contains a data URL, image bytes, coordinates, or stroke data.

- [ ] **Step 7: Verify the stored row and QR code**

Confirm the `Check-In` sheet contains the smoke reference with the nine expected values and no signature image. Scan/decode the production SVG or PNG and require the exact canonical URL. Open `/check-in/print/` and confirm it fits one printable page.

- [ ] **Step 8: Commit final integration files**

```bash
git add source/MANIFEST.md source/scripts/smoke-test-check-in.sh
git commit -m "test: cover production check-in flow"
```

- [ ] **Step 9: Finish issue and repository workflow**

Run:

```bash
bd close kf-q4q --reason="Check-in form, sheet pipeline, QR assets, deployment, and production smoke verification completed."
git pull --rebase
bd dolt push
git push
git status
gh pr view 24
```

Require the branch to be up to date with its remote and PR #24 to remain open against its base branch. Never merge automatically.
