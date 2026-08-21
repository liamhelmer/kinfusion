#!/bin/bash
# Narrow non-interactive facade for the Apps Script payment reconciliation API.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
IDS_FILE="$REPO_DIR/scripts/apps-script-ids.sh"

usage() {
  printf 'Usage: %s <staging|production> <status|auth-url|scan|approve|setup-sheet|reset-auth> [argument]\n' "$0" >&2
  exit 2
}

[[ $# -ge 2 ]] || usage
ENVIRONMENT="$1"
COMMAND="$2"
shift 2

# shellcheck source=apps-script-ids.sh
source "$IDS_FILE"
case "$ENVIRONMENT" in
  staging) EXECUTION_ID="$STAGING_DEPLOY_ID" ;;
  production) EXECUTION_ID="$PROD_DEPLOY_ID" ;;
  *) usage ;;
esac
[[ -n "$EXECUTION_ID" ]] || { printf 'Apps Script API-executable deployment ID is not configured for %s.\n' "$ENVIRONMENT" >&2; exit 2; }

FUNCTION_NAME=''
PARAMETERS='[]'
case "$COMMAND" in
  status)
    [[ $# -eq 0 ]] || usage
    FUNCTION_NAME='getPaymentGmailAuthStatus'
    ;;
  auth-url)
    [[ $# -eq 0 ]] || usage
    FUNCTION_NAME='getPaymentGmailAuthorizationUrl'
    ;;
  scan)
    [[ $# -le 1 ]] || usage
    MAX_RESULTS="${1:-25}"
    [[ "$MAX_RESULTS" =~ ^[0-9]+$ ]] && (( MAX_RESULTS >= 1 && MAX_RESULTS <= 50 )) || {
      printf 'scan max must be an integer from 1 through 50.\n' >&2; exit 2;
    }
    FUNCTION_NAME='scanPaymentGmailCandidates'
    PARAMETERS="[{\"maxResults\":$MAX_RESULTS}]"
    ;;
  approve)
    [[ $# -eq 1 ]] || usage
    APPROVAL_FILE="$1"
    [[ -f "$APPROVAL_FILE" && ! -L "$APPROVAL_FILE" ]] || {
      printf 'Approval payload must be a regular, non-symlink JSON file.\n' >&2; exit 2;
    }
    FILE_MODE="$(stat -f '%Lp' "$APPROVAL_FILE")"
    if (( (8#$FILE_MODE & 077) != 0 )); then
      printf 'Approval payload permissions are too broad; run chmod 600 on the file.\n' >&2
      exit 2
    fi
    FILE_SIZE="$(stat -f '%z' "$APPROVAL_FILE")"
    (( FILE_SIZE > 0 && FILE_SIZE <= 65536 )) || {
      printf 'Approval payload must be between 1 byte and 64 KiB.\n' >&2; exit 2;
    }
    APPROVAL_JSON="$(python3 -c 'import json,sys; value=json.load(open(sys.argv[1], encoding="utf-8")); print(json.dumps(value, separators=(",",":"), sort_keys=True))' "$APPROVAL_FILE" 2>/dev/null)" || {
      printf 'Approval payload is not valid JSON.\n' >&2; exit 2;
    }
    FUNCTION_NAME='approvePaymentReconciliation'
    PARAMETERS="[$APPROVAL_JSON]"
    ;;
  setup-sheet)
    [[ $# -eq 0 ]] || usage
    FUNCTION_NAME='setupPaymentReconciliationSheet'
    ;;
  reset-auth)
    [[ $# -eq 0 ]] || usage
    FUNCTION_NAME='resetPaymentGmailAuthorization'
    ;;
  *) usage ;;
esac

REQUEST_BODY="$(python3 -c 'import json,sys; print(json.dumps({"function":sys.argv[1],"parameters":json.loads(sys.argv[2]),"devMode":False}, separators=(",",":")))' "$FUNCTION_NAME" "$PARAMETERS")"
RESULT_FILE="$(mktemp)"
trap 'rm -f "$RESULT_FILE"' EXIT

gws script scripts run \
  --params "{\"scriptId\":\"$EXECUTION_ID\"}" \
  --json "$REQUEST_BODY" \
  > "$RESULT_FILE"

python3 -c '
import json,sys
data=json.load(open(sys.argv[1], encoding="utf-8"))
if data.get("error"):
    print(json.dumps({"ok":False,"error":"apps_script_execution_failed"}, separators=(",",":"), sort_keys=True))
    raise SystemExit(1)
response=data.get("response", {})
if response.get("error"):
    print(json.dumps({"ok":False,"error":"apps_script_function_failed","details":response["error"]}, separators=(",",":"), sort_keys=True))
    raise SystemExit(1)
print(json.dumps(response.get("result"), separators=(",",":"), sort_keys=True))
' "$RESULT_FILE"
