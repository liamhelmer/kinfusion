/**
 * Weekly Google Sheet backup trigger — ADR R11.1.
 * Exports the operational Sheet as XLSX to the Drive folder in BACKUP_DRIVE_FOLDER_ID Script Property.
 * Trigger: weekly, Sundays — install via installBackupTrigger() once.
 */

function runWeeklyBackup_() {
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty('SHEET_ID');
  var folderId = props.getProperty('BACKUP_DRIVE_FOLDER_ID');

  if (!sheetId || !folderId) {
    Logger.log('backup: SHEET_ID or BACKUP_DRIVE_FOLDER_ID not configured');
    return;
  }

  var dateStr = Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd');
  var fileName = 'KinFusion-Campout-backup-' + dateStr + '.xlsx';

  var folder = DriveApp.getFolderById(folderId);

  // Script lock prevents concurrent runs from racing through the existence check
  // and creating duplicate backup files.
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    // Idempotent: skip if backup for today already exists
    var existing = folder.getFilesByName(fileName);
    if (existing.hasNext()) {
      Logger.log('backup: file already exists for today: ' + fileName);
      return;
    }

    // Export as XLSX via Drive export URL
    var exportUrl = 'https://docs.google.com/spreadsheets/d/' + sheetId + '/export?format=xlsx';
    var token = ScriptApp.getOAuthToken();
    var response = UrlFetchApp.fetch(exportUrl, {
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true,
    });

    if (response.getResponseCode() !== 200) {
      throw new Error('backup: export failed with HTTP ' + response.getResponseCode());
    }

    var blob = response.getBlob().setName(fileName);
    folder.createFile(blob);
    Logger.log('backup: created ' + fileName + ' in folder ' + folderId);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Run once manually in the Apps Script editor to install the weekly trigger.
 * Safe to call multiple times — checks for existing trigger first.
 * Note: trigger runs in the project timezone (set to UTC in File -> Project settings).
 */
function installBackupTrigger() {
  assertController_();
  var triggers = ScriptApp.getProjectTriggers();
  var installed = false;
  for (var i = 0; i < triggers.length; i++) {
    var handler = triggers[i].getHandlerFunction();
    if (handler === 'runWeeklyBackup_') installed = true;
    if (handler === 'runWeeklyBackup') ScriptApp.deleteTrigger(triggers[i]);
  }
  if (!installed) {
    ScriptApp.newTrigger('runWeeklyBackup_')
      .timeBased()
      .onWeekDay(ScriptApp.WeekDay.SUNDAY)
      .atHour(0)
      .create();
  }
  Logger.log('installBackupTrigger: private weekly trigger installed (runs in project timezone)');
}
