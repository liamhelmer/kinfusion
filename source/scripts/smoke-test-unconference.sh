#!/bin/bash
# Smoke test for unconference proposal form against preview Worker + Apps Script.
#
# Usage:
#   PREVIEW_URL=https://kinfusion-website-preview.<account>.workers.dev bash smoke-test-unconference.sh

set -e

PREVIEW_URL="${PREVIEW_URL:-https://kinfusion-website-preview.workers.dev}"
TEST_TURNSTILE_TOKEN="1x0000000000000000000000000000000AA"
TEST_EMAIL="smoke-unconference@example.com"

echo "=== Smoke test: Unconference proposal form ==="
echo "Preview URL: $PREVIEW_URL"
echo ""

echo "--- Step 1: Fetch form token ---"
TOKEN_RESP=$(curl -s -X POST "$PREVIEW_URL/api/form-token" \
  -H "Content-Type: application/json")
echo "Response: $TOKEN_RESP"
TOKEN=$(echo "$TOKEN_RESP" | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')
echo "Token: $TOKEN"
echo ""

echo "--- Step 2: Submit unconference proposal ---"
RESP=$(curl -s -X POST "$PREVIEW_URL/api/unconference" \
  -H "Content-Type: application/json" \
  -d "{
    \"formToken\": \"$TOKEN\",
    \"cf-turnstile-response\": \"$TEST_TURNSTILE_TOKEN\",
    \"proposerName\": \"Smoke Test Proposer\",
    \"email\": \"$TEST_EMAIL\",
    \"workshopTitle\": \"Test Workshop: Contact Improv Basics\",
    \"description\": \"An introductory session on contact improvisation for all levels.\",
    \"duration\": \"60\",
    \"notes\": \"Needs a large open floor space.\",
    \"website\": \"\"
  }")
echo "Response: $RESP"
REF_CODE=$(echo "$RESP" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("refCode","ERROR: "+str(d)))')
echo "refCode: $REF_CODE"
echo ""

echo "--- Step 3: Validation error test (missing workshopTitle) ---"
TOKEN3=$(curl -s -X POST "$PREVIEW_URL/api/form-token" \
  -H "Content-Type: application/json" | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')
VAL_RESP=$(curl -s -X POST "$PREVIEW_URL/api/unconference" \
  -H "Content-Type: application/json" \
  -d "{
    \"formToken\": \"$TOKEN3\",
    \"cf-turnstile-response\": \"$TEST_TURNSTILE_TOKEN\",
    \"proposerName\": \"Test\",
    \"email\": \"$TEST_EMAIL\",
    \"description\": \"Missing title\",
    \"duration\": \"60\",
    \"website\": \"\"
  }")
echo "Validation response (expect ok:false, field:workshopTitle): $VAL_RESP"
echo ""

echo "=== MANUAL VERIFICATION STEPS ==="
echo "1. Open the staging Google Sheet Unconference tab — check for new row: $REF_CODE"
echo "2. Check $TEST_EMAIL inbox for confirmation email"
echo ""
echo "To tail Worker logs:"
echo "  wrangler tail kinfusion-website-preview --format=pretty"
