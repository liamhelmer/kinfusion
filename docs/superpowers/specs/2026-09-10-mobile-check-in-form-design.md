# Mobile Check-In Form Design

**Date:** 2026-09-10
**Status:** Approved in conversation; pending written review

## Purpose

Provide an on-site, phone-friendly check-in form at `/check-in/`. Attendees reach it by scanning a printed QR code, enter their contact and emergency-contact information, acknowledge the Kin-Fusion Code of Conduct, and draw a signature so the acknowledgement feels formal.

The signature image has no operational value and is sensitive data. The application therefore verifies that the attendee drew a stroke but never transmits or stores the canvas pixels.

## User Experience

The page presents one short, mobile-first form with these required fields:

1. Attendee name
2. Attendee phone number
3. Today's date, populated automatically and displayed read-only
4. Emergency-contact name
5. Emergency-contact phone number
6. Initials acknowledging: “I have read and agree to follow the Kin-Fusion Code of Conduct,” with “Code of Conduct” linked to `/code-of-conduct/`
7. A touch-friendly signature canvas

The signature area includes a Clear button. Submission is unavailable unless every required field is valid and the canvas contains at least one drawn stroke. Successful submission replaces the form with a concise “You’re checked in” confirmation and a reference code.

Text fields remain populated after recoverable submission failures. The form reports field-specific validation errors where possible and otherwise gives a clear retry message.

## Signature Privacy Boundary

The browser tracks only whether a genuine pointer or touch stroke occurred. The canvas bitmap, vector points, and stroke coordinates are not included in the request, logged, or stored. The request contains only `signatureCompleted: true`.

Clearing the canvas resets the completion state. Resizing or rotating a phone must not turn an untouched canvas into a completed signature. The implementation should preserve existing drawn content across ordinary responsive resizing when practical; if the browser cannot preserve it safely, it must visibly clear the canvas and reset completion rather than submit a false acknowledgement.

This interaction is an acknowledgement aid, not a claim that a legally durable electronic signature is retained.

## Architecture and Data Flow

The feature extends the existing form pipeline:

1. Eleventy renders `/check-in/` and loads a dedicated check-in browser module.
2. The shared form handler obtains a form token and supplies Turnstile verification.
3. The browser posts JSON to `POST /api/check-in`.
4. The Cloudflare Worker applies the existing form-token, Turnstile, honeypot, rate-limit, and deduplication protections, then validates the check-in payload.
5. The Worker HMAC-signs and forwards the validated payload to Apps Script.
6. Apps Script validates the signed request, appends a row to a `Check-In` tab in the existing Kin-Fusion spreadsheet, and returns a reference code.
7. No confirmation email is sent.

The new endpoint and handler should follow the structure of the existing form implementations without weakening their behavior or changing unrelated routes.

## Stored Data

Each `Check-In` row contains:

- Server-generated submission timestamp
- Browser-displayed local date
- Attendee name
- Attendee phone number, preserved as entered
- Emergency-contact name
- Emergency-contact phone number, preserved as entered
- Code of Conduct initials
- `signatureCompleted`, always the boolean `true` for accepted submissions
- Reference code

The server timestamp is authoritative. The displayed local date is stored for transparency but must not replace the server timestamp or be trusted for security decisions.

No signature pixels, stroke coordinates, email address, or confirmation-email status are stored.

The page includes a privacy notice consistent with the site's existing forms. Check-in records follow the event's existing personal-data retention deadline of December 12, 2026, with the same contact path for access or early deletion requests.

## Validation

Both browser and server require non-empty attendee name, attendee phone, emergency-contact name, emergency-contact phone, and initials within conservative length limits. Phone validation permits international formatting characters and does not reformat the submitted value. The server accepts `signatureCompleted` only when it is exactly `true`.

The client-populated date uses the attendee device's local calendar date in ISO `YYYY-MM-DD` form. The Worker validates its shape, while Apps Script records its own current timestamp independently.

The honeypot remains hidden and must be empty. Existing security and replay protections apply unchanged.

## Accessibility and Mobile Interaction

Every field has a visible label, required state, suitable autocomplete hint, and touch-sized target. The canvas has an accessible name and accompanying text explaining that drawing is required but the signature image is not saved. Its validation state is announced without relying on color alone.

The drawing surface supports pointer events so touch, stylus, and mouse follow the same code path. Page scrolling remains usable outside the canvas; while drawing, strokes should not scroll the page.

## QR Deliverables

The QR target is the canonical production URL:

`https://kinfusion.dance/check-in/`

The repository will include:

- A scalable SVG QR code for print layout
- A high-resolution PNG QR code for common document tools
- A printable page headed “Kin-Fusion Check-In” containing the QR code and written URL

The code uses adequate quiet space and error correction for reliable phone scanning. Verification must decode the generated QR asset back to the exact canonical URL.

## Error Handling

Client-side validation prevents incomplete submission and identifies the first invalid field. Network, security-challenge, expired-session, rate-limit, and upstream errors use the existing error mapping and leave entered data available for retry. The submit button cannot trigger concurrent duplicate requests and is restored after recoverable errors.

Apps Script rejects malformed or incomplete payloads before writing a row. A failed sheet write returns an upstream error and does not report success to the attendee.

## Verification

Automated verification covers:

- Worker acceptance and rejection cases for the check-in schema
- Apps Script validation and `Check-In` row construction
- Client signature state: untouched, drawn, cleared, and resized
- Form serialization proving no signature bitmap or stroke data is sent
- QR decoding to the exact production URL
- Eleventy output containing the expected form and assets

Browser verification uses a phone-sized Chrome viewport to draw, clear, redraw, fill the form, and submit. A production smoke submission confirms the complete Worker-to-Apps-Script path and the resulting `Check-In` sheet row. The smoke record is clearly labeled so organizers can remove it if desired.

## Out of Scope

- Retaining signature images or stroke data
- Sending attendee confirmation emails
- Treating the drawn mark as a durable legal electronic signature
- Looking up or modifying an attendee's prior registration
- Reformatting or validating ownership of phone numbers
