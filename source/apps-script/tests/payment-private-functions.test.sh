#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FILES=(
  "$ROOT/paymentHelpers.js"
  "$ROOT/paymentGmailAuth.js"
  "$ROOT/paymentGmailBridge.js"
  "$ROOT/paymentReconciliation.js"
)

while IFS= read -r declaration; do
  name="${declaration#function }"
  case "$name" in
    getPaymentGmailAuthStatus|getPaymentGmailAuthorizationUrl|resetPaymentGmailAuthorization|paymentGmailAuthCallback|scanPaymentGmailCandidates|setupPaymentReconciliationSheet|approvePaymentReconciliation)
      ;;
    *_)
      ;;
    *)
      printf 'FAIL: Apps Script helper is remotely callable because it lacks a trailing underscore: %s\n' "$name" >&2
      exit 1
      ;;
  esac
done < <(rg --no-filename -o '^function [A-Za-z0-9_]+' "${FILES[@]}")

printf 'payment Apps Script private-function test: PASS\n'
