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

## Separate payment Gmail authorization

Payment reconciliation uses a second OAuth grant stored in Script Properties. It
does not replace or modify the `kinfusion.campout@gmail.com` `gws` login.

1. In the Google Cloud project used for OAuth testing, enable the Gmail API, keep
   the consent audience in Testing, and add the payment mailbox as a test user.
2. Create a Web application OAuth client. Register this redirect URI for each
   Apps Script project being used:

   ```text
   https://script.google.com/macros/d/{SCRIPT_ID}/usercallback
   ```

3. In the Apps Script editor, call
   `setupPaymentGmailConfiguration(clientId, clientSecret, expectedAddress)`.
   Never put those values in source control, shell history, Beads, or a sheet.
4. Add these two Script Properties. They are fixed Gmail queries, not
   agent-supplied input; confirm the genuine provider sender/subject format
   before production use:

   ```text
   PAYMENT_GMAIL_INTERAC_QUERY=newer_than:90d (from:notify@payments.interac.ca OR from:notify@interac.ca) (subject:(Interac e-Transfer) OR subject:(Autodeposit))
   PAYMENT_GMAIL_WISE_QUERY=newer_than:90d (from:noreply@wise.com OR from:wise.com) (subject:(received) OR subject:(transfer))
   ```

5. Push and deploy Apps Script, then request the owner link with:

   ```bash
   source/scripts/payment-reconciliation.sh staging auth-url
   ```

6. After consent, verify `expectedAddress` equals `authorizedAddress` in:

   ```bash
   source/scripts/payment-reconciliation.sh staging status
   ```

The external grant requests only
`https://www.googleapis.com/auth/gmail.modify`. Testing-mode grants require
weekly reauthorization. The OAuth2 library is pinned to Apps Script library
version 43 in `appsscript.json`.

### Reconciliation commands

```bash
# Read-only candidate scan
source/scripts/payment-reconciliation.sh production scan 25

# One explicit, organizer-approved payload; file must be chmod 600
source/scripts/payment-reconciliation.sh production approve /path/to/approval.json
```

The approval writes `Pmts Received` before applying `kinfusion-etransfer`.
`label-pending` is safe to retry with the exact same approved payload and cannot
append a duplicate Gmail message group.

### End-of-event teardown

Run `source/scripts/payment-reconciliation.sh production reset-auth`, delete the
five `PAYMENT_GMAIL_*` configuration properties and OAuth2 service state from
Script Properties, and have the mailbox owner revoke the app in their Google
Account security settings.

## Spreadsheet

Staging sheet ID: `127ZrKsAi7n-tQteMW0lw1wMgunJm7tDFlGIvmQHCPgo`

Tabs:
- `Registrations` — one row per registration application
- `Children` — one row per child under 13 (linked to parent's refCode)
- `DJSignups` — one row per DJ signup
- `Unconference` — one row per workshop proposal
- `Pmts Received` — organizer payment ledger; reconciliation audit columns M:P
  are hidden
