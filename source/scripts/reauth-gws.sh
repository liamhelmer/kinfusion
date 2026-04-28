#!/bin/bash
# Re-authenticate gws with all scopes the Apps Script project requires.
#
# Why: the Apps Script API (used by push-apps-script.sh) requires the caller to
# hold every scope declared in apps-script/appsscript.json. A stock `gws auth
# login` does not request these by default.
#
# Output: captures the OAuth URL to /tmp/gws-auth-url.txt and auto-opens it in
# the default browser via xdg-open. If xdg-open is unavailable, the URL is
# echoed inside a code block so it survives terminal word-wrap.

set -e

SCOPES="https://www.googleapis.com/auth/script.projects,\
https://www.googleapis.com/auth/script.deployments,\
https://www.googleapis.com/auth/script.external_request,\
https://www.googleapis.com/auth/script.scriptapp,\
https://www.googleapis.com/auth/script.send_mail,\
https://www.googleapis.com/auth/drive,\
https://www.googleapis.com/auth/spreadsheets,\
https://www.googleapis.com/auth/userinfo.email"

OUT_FILE="/tmp/gws-auth-url.txt"
rm -f "$OUT_FILE"

# gws caches access tokens in ~/.config/gws/token_cache.json. After a re-auth
# that adds new scopes, that cache may still hold the OLD token, causing the
# API to keep returning "Request had insufficient authentication scopes". Clear
# it now so the next call mints a fresh access token from the refresh token.
TOKEN_CACHE="$HOME/.config/gws/token_cache.json"
if [[ -f "$TOKEN_CACHE" ]]; then
  cp "$TOKEN_CACHE" "/tmp/gws-token-cache.bak.json"
  rm -f "$TOKEN_CACHE"
fi

gws auth login --scopes "$SCOPES" > "$OUT_FILE" 2>&1 &
AUTH_PID=$!

# Wait up to 15s for the URL to appear
for _ in $(seq 1 30); do
  if grep -q "https://" "$OUT_FILE" 2>/dev/null; then break; fi
  sleep 0.5
done

URL=$(grep -oE 'https://accounts\.google\.com/o/oauth2/auth\?[^[:space:]]+' "$OUT_FILE" | head -1)

if [[ -z "$URL" ]]; then
  echo "ERROR: failed to capture OAuth URL. gws output:"
  cat "$OUT_FILE"
  exit 1
fi

echo "auth pid: $AUTH_PID"
echo ""
echo "URL (auto-opening in browser):"
echo ""
echo '```'
echo "$URL"
echo '```'
echo ""

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 &
  echo "(opened with xdg-open)"
elif command -v open >/dev/null 2>&1; then
  open "$URL" >/dev/null 2>&1 &
  echo "(opened with open)"
else
  echo "(no xdg-open/open available — copy URL above into a browser)"
fi
