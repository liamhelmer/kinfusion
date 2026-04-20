#!/bin/bash
# Creates a Google Spreadsheet for an environment and wires up the Apps Script SHEET_ID.
#
# Usage:
#   bash scripts/setup-spreadsheet.sh production
#   bash scripts/setup-spreadsheet.sh staging
#
# What this does:
#   1. Creates a new Google Spreadsheet with the right title
#   2. Adds Registrations, DJSignups, and UnconferenceProposals tabs with headers
#   3. Updates setupProperties.js with the new SHEET_ID
#   4. Pushes the Apps Script and creates a new version + deployment
#   5. Calls setupProperties() remotely to apply the new SHEET_ID to the live script

set -euo pipefail

ENV="${1:-}"
if [[ "$ENV" != "production" && "$ENV" != "staging" ]]; then
  echo "Usage: $0 [production|staging]" >&2
  exit 1
fi

SCRIPT_ID="10IOiyxAHmV7q5gkORDRK40OdnQKEaj99Z9PKZp61Na3YRBtRXBybM5SK"
DEPLOY_ID="AKfycby4_ZQFA43axZs0ndSaXhvy_lw5LXvt9hfufSXXy_HheiFxge6kIqjlFIWHJeszSJNB9A"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [[ "$ENV" == "production" ]]; then
  TITLE="Kin-Fusion Campout 2026 — Production"
else
  TITLE="Kin-Fusion Campout 2026 — Staging"
fi

# ── Step 1: Create spreadsheet with all three tabs ──────────────────────────
echo "Creating spreadsheet: $TITLE"

SHEET_ID=$(gws sheets spreadsheets create \
  --json "{
    \"properties\": { \"title\": \"$TITLE\" },
    \"sheets\": [
      { \"properties\": { \"title\": \"Registrations\" } },
      { \"properties\": { \"title\": \"DJSignups\" } },
      { \"properties\": { \"title\": \"UnconferenceProposals\" } }
    ]
  }" \
  | python3 -c 'import sys, json; print(json.load(sys.stdin)["spreadsheetId"])')

echo "Created: https://docs.google.com/spreadsheets/d/$SHEET_ID/edit"

# ── Step 2: Write headers ────────────────────────────────────────────────────
echo "Writing headers..."

gws sheets spreadsheets values update \
  --params "{\"spreadsheetId\":\"$SHEET_ID\",\"range\":\"Registrations!A1:V1\",\"valueInputOption\":\"RAW\"}" \
  --json '{"values":[["Timestamp","RefCode","FullName","Email","Pronouns","Tier","ScholarshipRequest","ScholarshipNote","Worktrade","ArrivalDay","LeavingDay","Accommodation","ChildrenCount","ParentPhone","DietaryNotes","AccessibilityNotes","HowDidYouHear","PhotoConsent","CodeOfConductAccepted","Status","PaymentStatus","Notes"]]}' \
  > /dev/null

gws sheets spreadsheets values update \
  --params "{\"spreadsheetId\":\"$SHEET_ID\",\"range\":\"DJSignups!A1:K1\",\"valueInputOption\":\"RAW\"}" \
  --json '{"values":[["Timestamp","RefCode","DJName","RealName","Email","SetStyle","SetLengthMin","PreferredTime","GearNeeded","Links","Notes"]]}' \
  > /dev/null

gws sheets spreadsheets values update \
  --params "{\"spreadsheetId\":\"$SHEET_ID\",\"range\":\"UnconferenceProposals!A1:I1\",\"valueInputOption\":\"RAW\"}" \
  --json '{"values":[["Timestamp","RefCode","ProposerName","Email","WorkshopTitle","Description","Duration","MaterialsNeeded","PreferredDay"]]}' \
  > /dev/null

echo "Headers written."

# ── Step 3: Freeze header rows ───────────────────────────────────────────────
# Get the sheet IDs assigned to each tab so we can freeze row 1
RAW_SHEETS=$(gws sheets spreadsheets get \
  --params "{\"spreadsheetId\":\"$SHEET_ID\",\"fields\":\"sheets.properties\"}")

freeze_requests() {
  python3 - "$RAW_SHEETS" <<'PYEOF'
import sys, json
raw = sys.argv[1]
sheets = json.loads(raw)["sheets"]
reqs = []
for s in sheets:
  reqs.append({
    "updateSheetProperties": {
      "properties": {
        "sheetId": s["properties"]["sheetId"],
        "gridProperties": { "frozenRowCount": 1 }
      },
      "fields": "gridProperties.frozenRowCount"
    }
  })
print(json.dumps({"requests": reqs}))
PYEOF
}

gws sheets spreadsheets batchUpdate \
  --params "{\"spreadsheetId\":\"$SHEET_ID\"}" \
  --json "$(freeze_requests)" \
  > /dev/null

echo "Header rows frozen."

# ── Step 4: Update setupProperties.js with the new SHEET_ID ─────────────────
SETUP_FILE="$REPO_DIR/apps-script/setupProperties.js"
python3 -c "
import re, pathlib
f = pathlib.Path('$SETUP_FILE')
f.write_text(re.sub(r\"'SHEET_ID': '[^']*'\", \"'SHEET_ID': '$SHEET_ID'\", f.read_text()))
"
echo "Updated setupProperties.js (SHEET_ID = $SHEET_ID)"

# ── Step 5: Push Apps Script ─────────────────────────────────────────────────
echo "Pushing Apps Script..."
bash "$REPO_DIR/scripts/push-apps-script.sh"

# ── Step 6: Create new version and update deployment ────────────────────────
echo "Creating new version..."
VERSION=$(gws script projects versions create \
  --params "{\"scriptId\":\"$SCRIPT_ID\"}" \
  --json "{\"description\":\"$ENV spreadsheet setup $(date +%Y-%m-%d)\"}" \
  | python3 -c 'import sys, json; print(json.load(sys.stdin)["versionNumber"])')
echo "Version: $VERSION"

gws script projects deployments update \
  --params "{\"scriptId\":\"$SCRIPT_ID\",\"deploymentId\":\"$DEPLOY_ID\"}" \
  --json "{\"deploymentConfig\":{\"description\":\"$ENV v$VERSION\",\"manifestFileName\":\"appsscript\",\"scriptId\":\"$SCRIPT_ID\",\"versionNumber\":$VERSION}}" \
  > /dev/null
echo "Deployment updated to v$VERSION."

# ── Step 7: Call setupProperties() via Apps Script Execution API ─────────────
echo "Running setupProperties() remotely..."
RUN_RESULT=$(gws script scripts run \
  --params "{\"scriptId\":\"$SCRIPT_ID\"}" \
  --json '{"function":"setupProperties","devMode":true}' 2>&1) && RUN_OK=true || RUN_OK=false

if [[ "$RUN_OK" == "true" ]] && echo "$RUN_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('done') else 1)" 2>/dev/null; then
  echo "setupProperties() completed successfully."
else
  echo ""
  echo "⚠ Remote execution of setupProperties() failed (this can happen if the"
  echo "  executionApi OAuth consent hasn't been granted yet)."
  echo ""
  echo "  To finish wiring up the Apps Script manually:"
  echo "  1. Open https://script.google.com and open the Kin-Fusion project"
  echo "  2. Run setupProperties() from the editor"
  echo "  3. Run authorizeMailApp() if this is the first time"
  echo ""
  echo "  The correct SHEET_ID ($SHEET_ID) is already in the source code."
fi

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "✓ $TITLE"
echo "  Sheet ID : $SHEET_ID"
echo "  URL      : https://docs.google.com/spreadsheets/d/$SHEET_ID/edit"
