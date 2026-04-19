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
    'SHEET_ID': '127ZrKsAi7n-tQteMW0lw1wMgunJm7tDFlGIvmQHCPgo',
    'FROM_EMAIL': 'kinfusion.campout@gmail.com',
    'ORGANIZER_EMAIL': 'kinfusion.campout@gmail.com',
    'BACKUP_DRIVE_FOLDER_ID': '1BsQRc0aSmOKPNLOMQBeMd6bDZv6cZSFg',
    'NONCE_CACHE_MIN': '10'
  });
  Logger.log('Script properties set.');
  return 'ok';
}
