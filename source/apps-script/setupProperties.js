// Run this from the editor to trigger MailApp authorization.
// If a permissions dialog appears, click through and allow all scopes.
// After it succeeds, form submission emails will work.
function authorizeMailApp() {
  var props = PropertiesService.getScriptProperties();
  var to = props.getProperty('ORGANIZER_EMAIL') || props.getProperty('FROM_EMAIL');
  if (!to) {
    throw new Error('Run setupProperties() first so ORGANIZER_EMAIL is set.');
  }
  MailApp.sendEmail(to, 'Kin-Fusion Apps Script — mail auth test', 'Mail authorization is working.');
  Logger.log('authorizeMailApp: test email sent to ' + to);
}

// Stores the external OAuth client used only for the separately owned payment
// mailbox. Pass values manually in the Apps Script editor; never commit them.
function setupPaymentGmailConfiguration(clientId, clientSecret, expectedAddress) {
  clientId = String(clientId || '').trim();
  clientSecret = String(clientSecret || '').trim();
  expectedAddress = String(expectedAddress || '').trim().toLowerCase();
  if (!clientId || !clientSecret || !expectedAddress || expectedAddress.indexOf('@') <= 0) {
    throw new Error('clientId, clientSecret, and a valid expectedAddress are required.');
  }
  var props = PropertiesService.getScriptProperties();
  props.setProperties({
    PAYMENT_GMAIL_CLIENT_ID: clientId,
    PAYMENT_GMAIL_CLIENT_SECRET: clientSecret,
    PAYMENT_GMAIL_EXPECTED_ADDRESS: expectedAddress,
  });
  props.deleteProperty('PAYMENT_GMAIL_AUTHORIZED_ADDRESS');
  Logger.log('Payment Gmail OAuth configuration stored for ' + expectedAddress + '.');
  return { ok: true, expectedAddress: expectedAddress };
}

// One-shot setup function. Run once from the Apps Script editor to set script
// properties and trigger OAuth authorization for all required scopes.
// Safe to re-run — setProperties overwrites existing values.
function setupProperties() {
  var props = PropertiesService.getScriptProperties();
  props.setProperties({
    'HMAC_KEY': '43feaee7d84a2a7202cbce94de8c3a28d60e1f2732087dbe4b2436bcaa748ef4',
    'SHEET_ID': '1KstgVDxWxmLlMME-bgzoEBVPJnzfXD4HN3kctnOlx3w',
    'FROM_EMAIL': 'kinfusion.campout@gmail.com',
    'ORGANIZER_EMAIL': 'kinfusion.campout@gmail.com',
    'BACKUP_DRIVE_FOLDER_ID': '1BsQRc0aSmOKPNLOMQBeMd6bDZv6cZSFg',
    'NONCE_CACHE_MIN': '10'
  });
  Logger.log('Script properties set.');
  return 'ok';
}

// Creates the required tabs with headers in the spreadsheet set by SHEET_ID.
// Run once from the editor after pointing SHEET_ID at a new blank spreadsheet.
// Safe to re-run — skips tabs that already exist.
function setupSpreadsheet() {
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty('SHEET_ID');
  if (!sheetId) throw new Error('SHEET_ID not set. Run setupProperties() first.');

  var ss = SpreadsheetApp.openById(sheetId);

  var tabs = [
    {
      name: 'Registrations',
      headers: [
        'Timestamp', 'RefCode', 'FullName', 'Email', 'Pronouns',
        'Tier', 'ScholarshipRequest', 'ScholarshipNote', 'Worktrade',
        'ArrivalDay', 'LeavingDay', 'Accommodation', 'ChildrenCount',
        'ParentPhone', 'DietaryNotes', 'AccessibilityNotes', 'HowDidYouHear',
        'PhotoConsent', 'CodeOfConductAccepted', 'Status', 'PaymentStatus', 'Notes',
        'Donation', 'RVLength', 'AdultAllergies', 'FridgeSpace',
        'IsYouth13to18', 'GuardianNames', 'KidsAgreementsAccepted'
      ]
    },
    {
      name: 'Children',
      headers: [
        'Timestamp', 'ParentRefCode', 'ParentName', 'ParentEmail', 'ParentPhone',
        'ChildName', 'ChildAge', 'ChildRelationship', 'ChildDietary',
        'ChildAllergies', 'ChildAlternateParents'
      ]
    },
    {
      name: 'DJSignups',
      headers: [
        'Timestamp', 'RefCode', 'DJName', 'RealName', 'Email',
        'SetStyle', 'SetLengthMin', 'PreferredTime', 'GearNeeded', 'Links', 'Notes',
        'ExperienceLevel'
      ]
    },
    {
      name: 'UnconferenceProposals',
      headers: [
        'Timestamp', 'RefCode', 'ProposerName', 'Email',
        'WorkshopTitle', 'Description', 'Duration', 'MaterialsNeeded', 'PreferredDay'
      ]
    }
  ];

  tabs.forEach(function (tab) {
    var sheet = ss.getSheetByName(tab.name);
    if (!sheet) {
      sheet = ss.insertSheet(tab.name);
      sheet.appendRow(tab.headers);
      sheet.setFrozenRows(1);
      Logger.log('Created tab: ' + tab.name);
      return;
    }

    // Tab exists — append any new header columns beyond the current width.
    var lastCol = sheet.getLastColumn();
    var currentHeaders = lastCol > 0
      ? sheet.getRange(1, 1, 1, lastCol).getValues()[0]
      : [];
    if (tab.headers.length > currentHeaders.length) {
      var extraHeaders = tab.headers.slice(currentHeaders.length);
      sheet.getRange(1, currentHeaders.length + 1, 1, extraHeaders.length).setValues([extraHeaders]);
      Logger.log('Added ' + extraHeaders.length + ' column(s) to ' + tab.name + ': ' + extraHeaders.join(', '));
    } else {
      Logger.log('Tab already up-to-date: ' + tab.name);
    }
    if (sheet.getFrozenRows() < 1) sheet.setFrozenRows(1);
  });

  return 'setupSpreadsheet complete';
}
