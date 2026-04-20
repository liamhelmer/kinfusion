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

// One-shot setup function. Run once from the Apps Script editor to set script
// properties and trigger OAuth authorization for all required scopes.
// Safe to re-run — setProperties overwrites existing values.
function setupProperties() {
  var props = PropertiesService.getScriptProperties();
  props.setProperties({
    'HMAC_KEY': '43feaee7d84a2a7202cbce94de8c3a28d60e1f2732087dbe4b2436bcaa748ef4',
    'SHEET_ID': '1VmzMnsg6g38Q_KxMgknVrxAUYAfpvGb9ju8Hey6rygE',
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
        'PhotoConsent', 'CodeOfConductAccepted', 'Status', 'PaymentStatus', 'Notes'
      ]
    },
    {
      name: 'DJSignups',
      headers: [
        'Timestamp', 'RefCode', 'DJName', 'RealName', 'Email',
        'SetStyle', 'SetLengthMin', 'PreferredTime', 'GearNeeded', 'Links', 'Notes'
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
    } else {
      Logger.log('Tab already exists, skipped: ' + tab.name);
    }
  });

  return 'setupSpreadsheet complete';
}
