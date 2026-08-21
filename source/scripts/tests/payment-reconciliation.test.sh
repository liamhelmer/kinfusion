#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEST_TMP="$(mktemp -d)"
trap 'rm -rf "$TEST_TMP"' EXIT

FAKE_BIN="$TEST_TMP/bin"
mkdir -p "$FAKE_BIN"
FAKE_GWS="$FAKE_BIN/gws"
printf '%s\n' \
  '#!/bin/bash' \
  'printf "%s\n" "$@" > "$PAYMENT_TEST_CAPTURE"' \
  'printf "%s\n" '\''{"response":{"result":{"ok":true,"authorized":false}}}'\''' \
  > "$FAKE_GWS"
chmod 700 "$FAKE_GWS"

export PATH="$FAKE_BIN:$PATH"
export PAYMENT_TEST_CAPTURE="$TEST_TMP/capture"

fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
assert_capture() { rg -F -- "$1" "$PAYMENT_TEST_CAPTURE" >/dev/null || fail "missing gws argument: $1"; }

output=$("$SCRIPT_DIR/payment-reconciliation.sh" staging status)
[[ "$output" == '{"authorized":false,"ok":true}' ]] || fail "status result was not unwrapped and stable"
assert_capture 'script'
assert_capture 'scripts'
assert_capture 'run'
assert_capture '"function":"getPaymentGmailAuthStatus"'
assert_capture '10IOiyxAHmV7q5gkORDRK40OdnQKEaj99Z9PKZp61Na3YRBtRXBybM5SK'

"$SCRIPT_DIR/payment-reconciliation.sh" production scan 7 >/dev/null
assert_capture '"function":"scanPaymentGmailCandidates"'
assert_capture '"parameters":[{"maxResults":7}]'
assert_capture '1mcpX6jf6sk4FYZq-NqFHMIIRsrIjpo1KDUnhdlaBDdRmRlXQdv4-XcJa'

payload="$TEST_TMP/approval.json"
printf '%s\n' '{"messageId":"msg-1","receivedAt":"2026-08-20T15:00:00Z","allocations":[{"refCode":"KF-A","amountCents":100,"notes":""}]}' > "$payload"
chmod 600 "$payload"
"$SCRIPT_DIR/payment-reconciliation.sh" staging approve "$payload" >/dev/null
assert_capture '"function":"approvePaymentReconciliation"'
assert_capture '"messageId":"msg-1"'

chmod 644 "$payload"
if "$SCRIPT_DIR/payment-reconciliation.sh" staging approve "$payload" >"$TEST_TMP/out" 2>"$TEST_TMP/err"; then
  fail 'overly permissive approval file was accepted'
fi
if rg -F 'msg-1' "$TEST_TMP/err" "$TEST_TMP/out" >/dev/null; then
  fail 'approval payload leaked on an error path'
fi

if "$SCRIPT_DIR/payment-reconciliation.sh" invalid status >/dev/null 2>&1; then
  fail 'invalid environment was accepted'
fi

printf 'payment-reconciliation facade tests: PASS\n'
