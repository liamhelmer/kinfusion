#!/bin/bash
# Smoke test for DJ application form against preview Worker + Apps Script.
#
# Usage:
#   PREVIEW_URL=https://kinfusion-website-preview.<account>.workers.dev bash smoke-test-dj.sh

set -e

PREVIEW_URL="${PREVIEW_URL:-https://kinfusion-website-preview.workers.dev}"
TEST_TURNSTILE_TOKEN="1x0000000000000000000000000000000AA"
TEST_EMAIL="smoke-dj@example.com"

echo "=== Smoke test: DJ application form ==="
echo "Preview URL: $PREVIEW_URL"
echo ""

echo "--- Step 1: Fetch form token ---"
TOKEN_RESP=$(curl -s -X POST "$PREVIEW_URL/api/form-token" \
  -H "Content-Type: application/json")
echo "Response: $TOKEN_RESP"
TOKEN=$(echo "$TOKEN_RESP" | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')
echo "Token: $TOKEN"
echo ""

echo "--- Step 2: Submit DJ application ---"
RESP=$(curl -s -X POST "$PREVIEW_URL/api/dj-signup" \
  -H "Content-Type: application/json" \
  -d "{
    \"formToken\": \"$TOKEN\",
    \"cf-turnstile-response\": \"$TEST_TURNSTILE_TOKEN\",
    \"djName\": \"DJ Smoke Test\",
    \"realName\": \"Smoke Tester\",
    \"email\": \"$TEST_EMAIL\",
    \"setStyle\": \"Ecstatic dance / contact improv transitions, mostly organic grooves\",
    \"setLengthMin\": \"90\",
    \"preferredTime\": \"Friday evening\",
    \"gearNeeded\": \"Just a DI box\",
    \"notes\": \"Happy to go later in the evening.\",
    \"links\": \"https://soundcloud.com/example\",
    \"website\": \"\"
  }")
echo "Response: $RESP"
REF_CODE=$(echo "$RESP" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("refCode","ERROR: "+str(d)))')
echo "refCode: $REF_CODE"
echo ""

echo "--- Step 3: Validation error test (invalid setLengthMin) ---"
TOKEN3=$(curl -s -X POST "$PREVIEW_URL/api/form-token" \
  -H "Content-Type: application/json" | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')
VAL_RESP=$(curl -s -X POST "$PREVIEW_URL/api/dj-signup" \
  -H "Content-Type: application/json" \
  -d "{
    \"formToken\": \"$TOKEN3\",
    \"cf-turnstile-response\": \"$TEST_TURNSTILE_TOKEN\",
    \"djName\": \"Test DJ\",
    \"email\": \"$TEST_EMAIL\",
    \"setStyle\": \"Ecstatic\",
    \"setLengthMin\": \"999\",
    \"website\": \"\"
  }")
echo "Validation response (expect ok:false, field:setLengthMin): $VAL_RESP"
echo ""

echo "=== MANUAL VERIFICATION STEPS ==="
echo "1. Open staging Google Sheet DJ tab — check for new row: $REF_CODE"
echo "2. Check $TEST_EMAIL inbox for confirmation email"
echo ""
echo "To tail Worker logs:"
echo "  wrangler tail kinfusion-website-preview --format=pretty"
