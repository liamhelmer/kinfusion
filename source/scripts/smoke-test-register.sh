#!/bin/bash
# T-2.9: First-form smoke test against staging Worker + Apps Script.
# Prerequisites: staging Apps Script deployed (T-2.1 human steps), preview Worker live.
#
# Usage:
#   PREVIEW_URL=https://kinfusion-website-preview.<account>.workers.dev bash smoke-test-register.sh
#
# Staging Turnstile note: set widget sitekey to 1x00000000000000000000AA in
# source/src/_data/site.json (turnstileSitekeyStaging) for the preview env.
# The test token below is accepted by Cloudflare's test sitekey.

set -e

PREVIEW_URL="${PREVIEW_URL:-https://kinfusion-website-preview.workers.dev}"
TEST_TURNSTILE_TOKEN="XXXX.DUMMY.TOKEN.XXXX"
TEST_EMAIL="smoke-test@example.com"

echo "=== Smoke test: Registration form ==="
echo "Preview URL: $PREVIEW_URL"
echo ""

echo "--- Step 1: Fetch form token ---"
TOKEN_RESP=$(curl -s -X POST "$PREVIEW_URL/api/form-token" \
  -H "Content-Type: application/json")
echo "Response: $TOKEN_RESP"
TOKEN=$(echo "$TOKEN_RESP" | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')
echo "Token: $TOKEN"
echo ""

echo "--- Step 2: Submit registration ---"
REGISTER_RESP=$(curl -s -X POST "$PREVIEW_URL/api/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"formToken\": \"$TOKEN\",
    \"cf-turnstile-response\": \"$TEST_TURNSTILE_TOKEN\",
    \"fullName\": \"Smoke Test Attendee\",
    \"email\": \"$TEST_EMAIL\",
    \"pronouns\": \"they/them\",
    \"tier\": \"350\",
    \"arrivalDay\": \"friday\",
    \"codeOfConductAccepted\": true,
    \"photoConsent\": false,
    \"website\": \"\"
  }")
echo "Response: $REGISTER_RESP"
REF_CODE=$(echo "$REGISTER_RESP" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("refCode","ERROR: "+str(d)))')
echo "refCode: $REF_CODE"
echo ""

echo "--- Step 3: Replay test (dedupe — expect 'already received') ---"
TOKEN2=$(curl -s -X POST "$PREVIEW_URL/api/form-token" \
  -H "Content-Type: application/json" | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')
REPLAY_RESP=$(curl -s -X POST "$PREVIEW_URL/api/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"formToken\": \"$TOKEN2\",
    \"cf-turnstile-response\": \"$TEST_TURNSTILE_TOKEN\",
    \"fullName\": \"Smoke Test Attendee\",
    \"email\": \"$TEST_EMAIL\",
    \"tier\": \"350\",
    \"arrivalDay\": \"friday\",
    \"codeOfConductAccepted\": true,
    \"photoConsent\": false,
    \"website\": \"\"
  }")
echo "Replay response (expect ok:true with 'already received'): $REPLAY_RESP"
echo ""

echo "=== MANUAL VERIFICATION STEPS ==="
echo "1. Open the staging Google Sheet — check for a new row with refCode: $REF_CODE"
echo "2. Check organizer inbox for confirmation email within 30 seconds"
echo "3. Verify email is NOT in the spam folder"
echo "4. Verify email from= organizer Gmail, replyTo= hello@kinfusion.dance"
echo "5. Verify email subject contains: $REF_CODE"
echo ""
echo "To tail Worker logs:"
echo "  wrangler tail kinfusion-website-preview --format=pretty"
