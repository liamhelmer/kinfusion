#!/bin/bash
# Creates a Google Spreadsheet and wires up the corresponding Apps Script project.
#
# Usage:
#   bash scripts/setup-spreadsheet.sh production   # creates prod project + sheet
#   bash scripts/setup-spreadsheet.sh staging      # recreates staging sheet only
#
# Production (first run): creates a new Apps Script project, deploys it, updates
#   the production worker's APPS_SCRIPT_URL secret, and creates the spreadsheet.
# Production (subsequent runs): recreates the spreadsheet and re-wires the SHEET_ID.
# Staging: recreates the staging spreadsheet and re-wires the SHEET_ID.
#
# One manual step remains after running: open the Apps Script editor and run
#   setupProperties() to apply the new SHEET_ID to the live script — unless
#   the executionApi OAuth consent has already been granted (then it runs automatically).

set -euo pipefail

ENV="${1:-}"
if [[ "$ENV" != "production" && "$ENV" != "staging" ]]; then
  echo "Usage: $0 [production|staging]" >&2; exit 1
fi

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
IDS_FILE="$REPO_DIR/scripts/apps-script-ids.sh"
SETUP_FILE="$REPO_DIR/apps-script/setupProperties.js"

source "$IDS_FILE"

# ── Resolve which Apps Script project to use ────────────────────────────────
if [[ "$ENV" == "production" ]]; then
  SHEET_TITLE="Kin-Fusion Campout 2026 — Production"
  WORKER_ENV="production"

  if [[ -z "$PROD_SCRIPT_ID" ]]; then
    # ── First production run: create a new Apps Script project ──────────────
    echo "No production Apps Script project found. Creating one..."

    PROD_SCRIPT_ID=$(gws script projects create \
      --json '{"title":"Kin-Fusion Campout — Production Forms"}' \
      | python3 -c 'import sys,json; print(json.load(sys.stdin)["scriptId"])')
    echo "Created production Apps Script project: $PROD_SCRIPT_ID"

    # Persist IDs immediately (DEPLOY_ID/URL filled in after deployment below)
    python3 - "$IDS_FILE" "$PROD_SCRIPT_ID" "" "" <<'PYEOF'
import sys, re, pathlib
f, sid, did, durl = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3], sys.argv[4]
t = f.read_text()
t = re.sub(r'PROD_SCRIPT_ID="[^"]*"', f'PROD_SCRIPT_ID="{sid}"', t)
t = re.sub(r'PROD_DEPLOY_ID="[^"]*"',  f'PROD_DEPLOY_ID="{did}"',  t)
t = re.sub(r'PROD_DEPLOY_URL="[^"]*"', f'PROD_DEPLOY_URL="{durl}"', t)
f.write_text(t)
PYEOF
  fi

  SCRIPT_ID="$PROD_SCRIPT_ID"

else
  SHEET_TITLE="Kin-Fusion Campout 2026 — Staging"
  WORKER_ENV="preview"
  SCRIPT_ID="$STAGING_SCRIPT_ID"
fi

# ── Step 1: Create spreadsheet with all three tabs ──────────────────────────
echo "Creating spreadsheet: $SHEET_TITLE"

SHEET_ID=$(gws sheets spreadsheets create \
  --json "{
    \"properties\": { \"title\": \"$SHEET_TITLE\" },
    \"sheets\": [
      { \"properties\": { \"title\": \"Registrations\" } },
      { \"properties\": { \"title\": \"Children\" } },
      { \"properties\": { \"title\": \"DJSignups\" } },
      { \"properties\": { \"title\": \"UnconferenceProposals\" } }
    ]
  }" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["spreadsheetId"])')

echo "Created: https://docs.google.com/spreadsheets/d/$SHEET_ID/edit"

# ── Step 2: Write headers ────────────────────────────────────────────────────
echo "Writing headers..."

gws sheets spreadsheets values update \
  --params "{\"spreadsheetId\":\"$SHEET_ID\",\"range\":\"Registrations!A1:AC1\",\"valueInputOption\":\"RAW\"}" \
  --json '{"values":[["Timestamp","RefCode","FullName","Email","Pronouns","Tier","ScholarshipRequest","ScholarshipNote","Worktrade","ArrivalDay","LeavingDay","Accommodation","ChildrenCount","ParentPhone","DietaryNotes","AccessibilityNotes","HowDidYouHear","PhotoConsent","CodeOfConductAccepted","Status","PaymentStatus","Notes","Donation","RVLength","AdultAllergies","FridgeSpace","IsYouth13to18","GuardianNames","KidsAgreementsAccepted"]]}' \
  > /dev/null

gws sheets spreadsheets values update \
  --params "{\"spreadsheetId\":\"$SHEET_ID\",\"range\":\"Children!A1:K1\",\"valueInputOption\":\"RAW\"}" \
  --json '{"values":[["Timestamp","ParentRefCode","ParentName","ParentEmail","ParentPhone","ChildName","ChildAge","ChildRelationship","ChildDietary","ChildAllergies","ChildAlternateParents"]]}' \
  > /dev/null

gws sheets spreadsheets values update \
  --params "{\"spreadsheetId\":\"$SHEET_ID\",\"range\":\"DJSignups!A1:L1\",\"valueInputOption\":\"RAW\"}" \
  --json '{"values":[["Timestamp","RefCode","DJName","RealName","Email","SetStyle","SetLengthMin","PreferredTime","GearNeeded","Links","Notes","ExperienceLevel"]]}' \
  > /dev/null

gws sheets spreadsheets values update \
  --params "{\"spreadsheetId\":\"$SHEET_ID\",\"range\":\"UnconferenceProposals!A1:I1\",\"valueInputOption\":\"RAW\"}" \
  --json '{"values":[["Timestamp","RefCode","ProposerName","Email","WorkshopTitle","Description","Duration","MaterialsNeeded","PreferredDay"]]}' \
  > /dev/null

echo "Headers written."

# ── Step 3: Freeze header rows ───────────────────────────────────────────────
RAW_SHEETS=$(gws sheets spreadsheets get \
  --params "{\"spreadsheetId\":\"$SHEET_ID\",\"fields\":\"sheets.properties\"}")

FREEZE_JSON=$(python3 - "$RAW_SHEETS" <<'PYEOF'
import sys, json
sheets = json.loads(sys.argv[1])["sheets"]
reqs = [{"updateSheetProperties": {"properties": {"sheetId": s["properties"]["sheetId"], "gridProperties": {"frozenRowCount": 1}}, "fields": "gridProperties.frozenRowCount"}} for s in sheets]
print(json.dumps({"requests": reqs}))
PYEOF
)

gws sheets spreadsheets batchUpdate \
  --params "{\"spreadsheetId\":\"$SHEET_ID\"}" \
  --json "$FREEZE_JSON" > /dev/null

echo "Header rows frozen."

# ── Step 4: Update setupProperties.js with the new SHEET_ID ─────────────────
python3 -c "
import re, pathlib
f = pathlib.Path('$SETUP_FILE')
f.write_text(re.sub(r\"'SHEET_ID': '[^']*'\", \"'SHEET_ID': '$SHEET_ID'\", f.read_text()))
"
echo "Updated setupProperties.js (SHEET_ID = $SHEET_ID)"

# ── Step 5: Push Apps Script to the correct project ─────────────────────────
echo "Pushing Apps Script to $ENV project ($SCRIPT_ID)..."

APPS_SCRIPT_DIR="$REPO_DIR/apps-script"
PUSH_DIRNAME="kf-apps-script-push-$$"
PUSH_DIR="/tmp/$PUSH_DIRNAME"
mkdir -p "$PUSH_DIR"
trap 'rm -rf "$PUSH_DIR"' EXIT

cp "$APPS_SCRIPT_DIR/appsscript.json" "$PUSH_DIR/"
cp "$APPS_SCRIPT_DIR"/*.js "$PUSH_DIR/" 2>/dev/null || true
cp "$APPS_SCRIPT_DIR"/handlers/*.js "$PUSH_DIR/"
cp "$APPS_SCRIPT_DIR"/templates/*.html "$PUSH_DIR/"

cd /tmp
gws script +push --script "$SCRIPT_ID" --dir "$PUSH_DIRNAME" > /dev/null
echo "Push complete."

# ── Step 6: Create version + deployment ─────────────────────────────────────
echo "Creating version..."
cd "$REPO_DIR"

VERSION=$(gws script projects versions create \
  --params "{\"scriptId\":\"$SCRIPT_ID\"}" \
  --json "{\"description\":\"$ENV setup $(date +%Y-%m-%d)\"}" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["versionNumber"])')
echo "Version: $VERSION"

# Determine current DEPLOY_ID for this env
if [[ "$ENV" == "production" ]]; then
  source "$IDS_FILE"  # re-source in case we just updated PROD_SCRIPT_ID
  CURRENT_DEPLOY_ID="$PROD_DEPLOY_ID"
else
  CURRENT_DEPLOY_ID="$STAGING_DEPLOY_ID"
fi

if [[ -z "$CURRENT_DEPLOY_ID" ]]; then
  # First deployment for this project
  DEPLOY_RESULT=$(gws script projects deployments create \
    --params "{\"scriptId\":\"$SCRIPT_ID\"}" \
    --json "{\"description\":\"$ENV v$VERSION\",\"manifestFileName\":\"appsscript\",\"scriptId\":\"$SCRIPT_ID\",\"versionNumber\":$VERSION}")

  CURRENT_DEPLOY_ID=$(echo "$DEPLOY_RESULT" | python3 -c 'import sys,json; print(json.load(sys.stdin)["deploymentId"])')
  DEPLOY_URL=$(echo "$DEPLOY_RESULT" | python3 -c '
import sys, json
d = json.load(sys.stdin)
for ep in d.get("entryPoints", []):
    if ep.get("entryPointType") == "WEB_APP":
        print(ep["webApp"]["url"])
        break
')
  echo "Created deployment: $CURRENT_DEPLOY_ID"

  # Persist the new deploy ID and URL
  python3 - "$IDS_FILE" "$PROD_SCRIPT_ID" "$CURRENT_DEPLOY_ID" "$DEPLOY_URL" <<'PYEOF'
import sys, re, pathlib
f, sid, did, durl = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3], sys.argv[4]
t = f.read_text()
t = re.sub(r'PROD_SCRIPT_ID="[^"]*"', f'PROD_SCRIPT_ID="{sid}"', t)
t = re.sub(r'PROD_DEPLOY_ID="[^"]*"',  f'PROD_DEPLOY_ID="{did}"',  t)
t = re.sub(r'PROD_DEPLOY_URL="[^"]*"', f'PROD_DEPLOY_URL="{durl}"', t)
f.write_text(t)
PYEOF
  echo "Updated apps-script-ids.sh with production deployment info."

else
  # Update existing deployment
  gws script projects deployments update \
    --params "{\"scriptId\":\"$SCRIPT_ID\",\"deploymentId\":\"$CURRENT_DEPLOY_ID\"}" \
    --json "{\"deploymentConfig\":{\"description\":\"$ENV v$VERSION\",\"manifestFileName\":\"appsscript\",\"scriptId\":\"$SCRIPT_ID\",\"versionNumber\":$VERSION}}" \
    > /dev/null
  echo "Deployment updated to v$VERSION."

  # Look up the deploy URL for the worker secret update below
  DEPLOY_URL=$(gws script projects deployments list \
    --params "{\"scriptId\":\"$SCRIPT_ID\"}" \
    | python3 -c "
import sys, json
data = json.load(sys.stdin)
for dep in data.get('deployments', []):
    if dep.get('deploymentId') == '$CURRENT_DEPLOY_ID':
        for ep in dep.get('entryPoints', []):
            if ep.get('entryPointType') == 'WEB_APP':
                print(ep['webApp']['url'])
                exit()
")
fi

# ── Step 7: Update worker APPS_SCRIPT_URL secret ────────────────────────────
if [[ -n "$DEPLOY_URL" ]]; then
  echo "Updating $WORKER_ENV worker APPS_SCRIPT_URL → $DEPLOY_URL"
  echo "$DEPLOY_URL" | wrangler secret put APPS_SCRIPT_URL --env "$WORKER_ENV" 2>&1 | grep -v "^Using\|^▲\|^$"
else
  echo "⚠ Could not determine deployment URL — update APPS_SCRIPT_URL manually."
fi

# ── Step 8: Call setupProperties() remotely ─────────────────────────────────
echo "Running setupProperties() remotely..."
RUN_RESULT=$(gws script scripts run \
  --params "{\"scriptId\":\"$SCRIPT_ID\"}" \
  --json '{"function":"setupProperties","devMode":true}' 2>&1) && RUN_OK=true || RUN_OK=false

if [[ "$RUN_OK" == "true" ]] && echo "$RUN_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('done') else 1)" 2>/dev/null; then
  echo "setupProperties() succeeded."
else
  echo ""
  echo "⚠ Remote setupProperties() failed (executionApi OAuth not yet consented)."
  echo "  Open https://script.google.com, find the $ENV project, and run setupProperties()."
  echo "  The correct SHEET_ID ($SHEET_ID) is already in the source."
fi

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "✓ $SHEET_TITLE"
echo "  Sheet ID   : $SHEET_ID"
echo "  Script ID  : $SCRIPT_ID"
echo "  Deploy URL : ${DEPLOY_URL:-unknown}"
echo "  URL        : https://docs.google.com/spreadsheets/d/$SHEET_ID/edit"
