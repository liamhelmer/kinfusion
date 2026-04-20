#!/bin/bash
# Push local Apps Script files to the staging or production project.
# Excludes tests/ (ES module syntax incompatible with Apps Script V8).
#
# Usage:
#   bash scripts/push-apps-script.sh [staging|production]   (default: staging)
#
# After pushing, create a version and update the deployment:
#   bash scripts/push-apps-script.sh staging   # or production

set -e

ENV="${1:-staging}"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
IDS_FILE="$REPO_DIR/scripts/apps-script-ids.sh"

if [[ ! -f "$IDS_FILE" ]]; then
  echo "Error: $IDS_FILE not found." >&2; exit 1
fi
source "$IDS_FILE"

if [[ "$ENV" == "production" ]]; then
  if [[ -z "$PROD_SCRIPT_ID" ]]; then
    echo "Error: PROD_SCRIPT_ID not set. Run 'bash scripts/setup-spreadsheet.sh production' first." >&2
    exit 1
  fi
  SCRIPT_ID="$PROD_SCRIPT_ID"
  DEPLOY_ID="$PROD_DEPLOY_ID"
elif [[ "$ENV" == "staging" ]]; then
  SCRIPT_ID="$STAGING_SCRIPT_ID"
  DEPLOY_ID="$STAGING_DEPLOY_ID"
else
  echo "Usage: $0 [staging|production]" >&2; exit 1
fi

APPS_SCRIPT_DIR="$REPO_DIR/apps-script"
PUSH_DIRNAME="kf-apps-script-push-$$"
PUSH_DIR="/tmp/$PUSH_DIRNAME"
mkdir -p "$PUSH_DIR"
trap 'rm -rf "$PUSH_DIR"' EXIT

cp "$APPS_SCRIPT_DIR/appsscript.json" "$PUSH_DIR/"
cp "$APPS_SCRIPT_DIR"/*.js "$PUSH_DIR/" 2>/dev/null || true
cp "$APPS_SCRIPT_DIR"/handlers/*.js "$PUSH_DIR/"
cp "$APPS_SCRIPT_DIR"/templates/*.html "$PUSH_DIR/"

echo "Pushing to $ENV (script: $SCRIPT_ID)..."
echo "Files: $(ls "$PUSH_DIR" | tr '\n' ' ')"
echo ""

cd /tmp
gws script +push --script "$SCRIPT_ID" --dir "$PUSH_DIRNAME"
echo ""

# Create a new version and update (or create) the deployment
VERSION=$(gws script projects versions create \
  --params "{\"scriptId\":\"$SCRIPT_ID\"}" \
  --json "{\"description\":\"$ENV $(date +%Y-%m-%d)\"}" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["versionNumber"])')
echo "Created version $VERSION."

if [[ -n "$DEPLOY_ID" ]]; then
  gws script projects deployments update \
    --params "{\"scriptId\":\"$SCRIPT_ID\",\"deploymentId\":\"$DEPLOY_ID\"}" \
    --json "{\"deploymentConfig\":{\"description\":\"$ENV v$VERSION\",\"manifestFileName\":\"appsscript\",\"scriptId\":\"$SCRIPT_ID\",\"versionNumber\":$VERSION}}" \
    > /dev/null
  echo "Deployment $DEPLOY_ID updated to v$VERSION."
else
  echo "No DEPLOY_ID set — skipping deployment update (setup-spreadsheet.sh will create it)."
fi
