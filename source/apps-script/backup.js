/**
 * Weekly Google Sheet backup trigger — ADR R11.1.
 * Exports the operational Sheet as XLSX to the Drive folder in BACKUP_DRIVE_FOLDER_ID Script Property.
 * Trigger: weekly, Sundays — install via installBackupTrigger() once.
 */

function runWeeklyBackup() {
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
    Logger.log('backup: export failed with status ' + response.getResponseCode());
    return;
  }

  var blob = response.getBlob().setName(fileName);
  folder.createFile(blob);
  Logger.log('backup: created ' + fileName + ' in folder ' + folderId);
}

/**
 * Run once manually in the Apps Script editor to install the weekly trigger.
 * Safe to call multiple times — checks for existing trigger first.
 */
function installBackupTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runWeeklyBackup') {
      Logger.log('installBackupTrigger: trigger already installed');
      return;
    }
  }
  ScriptApp.newTrigger('runWeeklyBackup')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(0)
    .create();
  Logger.log('installBackupTrigger: weekly Sunday midnight trigger installed');
}
