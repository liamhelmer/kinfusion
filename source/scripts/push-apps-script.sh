#!/bin/bash
# Push local Apps Script files to the Google Apps Script project.
# Excludes the tests/ directory (contains ES module syntax incompatible with Apps Script V8).
#
# Usage: bash scripts/push-apps-script.sh
#
# After pushing, create a new version and update the deployment:
#   VERSION=$(gws script projects versions create \
#     --params '{"scriptId":"SCRIPT_ID"}' \
#     --json '{"description":"staging vN - description"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["versionNumber"])')
#   gws script projects deployments update \
#     --params '{"scriptId":"SCRIPT_ID","deploymentId":"DEPLOY_ID"}' \
#     --json "{\"deploymentConfig\":{\"description\":\"staging vN\",\"manifestFileName\":\"appsscript\",\"scriptId\":\"SCRIPT_ID\",\"versionNumber\":$VERSION}}"

set -e

SCRIPT_ID="${SCRIPT_ID:-10IOiyxAHmV7q5gkORDRK40OdnQKEaj99Z9PKZp61Na3YRBtRXBybM5SK}"
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)/apps-script"
PUSH_DIRNAME="kf-apps-script-push-$$"
PUSH_DIR="/tmp/$PUSH_DIRNAME"
mkdir -p "$PUSH_DIR"
trap 'rm -rf "$PUSH_DIR"' EXIT

# Copy all deployable files (exclude tests/, README.md)
cp "$SCRIPT_DIR/appsscript.json" "$PUSH_DIR/"
cp "$SCRIPT_DIR"/*.js "$PUSH_DIR/" 2>/dev/null || true
cp "$SCRIPT_DIR"/handlers/*.js "$PUSH_DIR/"
cp "$SCRIPT_DIR"/templates/*.html "$PUSH_DIR/"

echo "Files to push:"
ls "$PUSH_DIR"
echo ""

cd /tmp
gws script +push --script "$SCRIPT_ID" --dir "$PUSH_DIRNAME"
echo ""
echo "Push complete. Create a new version and update the deployment to go live."
