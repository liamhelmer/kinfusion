# Kin-Fusion Apps Script

Web app deployed to Google Apps Script that handles form submissions for the Kin-Fusion Campout 2026 website.

## Authentication

Log in with the `kinfusion.campout@gmail.com` account and all required scopes:

```bash
gws auth login --scopes "https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/drive,https://www.googleapis.com/auth/script.send_mail,https://www.googleapis.com/auth/script.external_request,https://www.googleapis.com/auth/script.scriptapp,https://www.googleapis.com/auth/script.projects,https://www.googleapis.com/auth/script.deployments"
```

## Deployment

Script ID: `10IOiyxAHmV7q5gkORDRK40OdnQKEaj99Z9PKZp61Na3YRBtRXBybM5SK`

```bash
# Push code to HEAD
cd /tmp && cp -r /path/to/apps-script kf-apps-script
gws script +push --script 10IOiyxAHmV7q5gkORDRK40OdnQKEaj99Z9PKZp61Na3YRBtRXBybM5SK --dir kf-apps-script

# Create new version
gws script projects versions create \
  --params '{"scriptId":"10IOiyxAHmV7q5gkORDRK40OdnQKEaj99Z9PKZp61Na3YRBtRXBybM5SK"}' \
  --json '{"description":"your description here"}'

# Update deployment to new version (replace VERSION and DEPLOYMENT_ID)
gws script projects deployments update \
  --params '{"scriptId":"10IOiyxAHmV7q5gkORDRK40OdnQKEaj99Z9PKZp61Na3YRBtRXBybM5SK","deploymentId":"AKfycby4_ZQFA43axZs0ndSaXhvy_lw5LXvt9hfufSXXy_HheiFxge6kIqjlFIWHJeszSJNB9A"}' \
  --json '{"deploymentConfig":{"description":"your description","versionNumber":VERSION,"manifestFileName":"appsscript","scriptId":"10IOiyxAHmV7q5gkORDRK40OdnQKEaj99Z9PKZp61Na3YRBtRXBybM5SK"}}'
```

## First-time setup

After any scope change, open the Apps Script editor and run `setupProperties()` to trigger re-authorization.

## Spreadsheet

Staging sheet ID: `127ZrKsAi7n-tQteMW0lw1wMgunJm7tDFlGIvmQHCPgo`

Tabs:
- `Registrations` — one row per registration application
- `Children` — one row per child under 13 (linked to parent's refCode)
- `DJSignups` — one row per DJ signup
- `Unconference` — one row per workshop proposal
