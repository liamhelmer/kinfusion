/**
 * 90-day post-event retention-delete trigger — ADR R8.2 / R8.3.
 *
 * On or after DELETE_AFTER_DATE (2026-12-12):
 *  1. Archives aggregate counts (no PII) to "KinFusion-2026-Archive" tab.
 *  2. Deletes all data rows from operational tabs (preserves header rows).
 *  3. Sends notification email to ORGANIZER_EMAIL Script Property.
 *
 * Before DELETE_AFTER_DATE: logs a no-op message and returns.
 * Idempotent: checks for an existing archive entry before executing.
 *
 * Trigger: daily — install via installRetentionTrigger() once.
 */

// Named constant per ADR R8.2 — 90 days after event end 2026-09-13.
var DELETE_AFTER_DATE = new Date('2026-12-12T00:00:00Z');

var OPERATIONAL_TABS = ['Registrations', 'UnconferenceProposals', 'DJSignups'];
var ARCHIVE_TAB_NAME = 'KinFusion-2026-Archive';

function runRetentionCheck() {
  return _runRetentionCheck(new Date(), DELETE_AFTER_DATE);
}

/**
 * Internal implementation — accepts injected dates for testability.
 * @param {Date} now - current date (injected for tests)
 * @param {Date} deleteAfter - deletion threshold date (injected for tests)
 */
function _runRetentionCheck(now, deleteAfter) {
  if (now < deleteAfter) {
    Logger.log('retention: not yet due (due ' + Utilities.formatDate(deleteAfter, 'UTC', 'yyyy-MM-dd') + ')');
    return { action: 'noop', reason: 'before_delete_date' };
  }

  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty('SHEET_ID');
  var organizerEmail = props.getProperty('ORGANIZER_EMAIL');

  if (!sheetId) {
    Logger.log('retention: SHEET_ID not configured');
    return { action: 'error', reason: 'missing_sheet_id' };
  }

  var ss = SpreadsheetApp.openById(sheetId);

  // Idempotency check: if archive tab already has data rows, skip
  var archiveSheet = ss.getSheetByName(ARCHIVE_TAB_NAME);
  if (archiveSheet && archiveSheet.getLastRow() > 1) {
    Logger.log('retention: archive already exists — idempotent skip');
    return { action: 'noop', reason: 'already_archived' };
  }

  // Collect aggregate counts before deletion
  var counts = {};
  for (var i = 0; i < OPERATIONAL_TABS.length; i++) {
    var tabName = OPERATIONAL_TABS[i];
    var sheet = ss.getSheetByName(tabName);
    if (sheet) {
      // lastRow - 1 because row 1 is the header
      counts[tabName] = Math.max(0, sheet.getLastRow() - 1);
    } else {
      counts[tabName] = 0;
    }
  }

  // Create or clear the archive tab
  if (!archiveSheet) {
    archiveSheet = ss.insertSheet(ARCHIVE_TAB_NAME);
  } else {
    archiveSheet.clearContents();
  }

  // Write aggregate data — no PII
  var archiveTimestamp = Utilities.formatDate(now, 'UTC', 'yyyy-MM-dd HH:mm:ss z');
  archiveSheet.appendRow(['archived_at', 'tab', 'row_count']);
  for (var j = 0; j < OPERATIONAL_TABS.length; j++) {
    var tab = OPERATIONAL_TABS[j];
    archiveSheet.appendRow([archiveTimestamp, tab, counts[tab]]);
  }
  archiveSheet.setFrozenRows(1);

  Logger.log('retention: archived counts — ' + JSON.stringify(counts));

  // Delete data rows from operational tabs (keep header row)
  for (var k = 0; k < OPERATIONAL_TABS.length; k++) {
    var opSheet = ss.getSheetByName(OPERATIONAL_TABS[k]);
    if (opSheet && opSheet.getLastRow() > 1) {
      opSheet.deleteRows(2, opSheet.getLastRow() - 1);
    }
  }

  Logger.log('retention: operational rows deleted');

  // Send notification email
  if (organizerEmail) {
    var subject = 'Kin-Fusion Campout 2026 — 90-day retention delete complete';
    var body = [
      'This is an automated notification from the Kin-Fusion Campout data retention trigger.',
      '',
      'Personal data has been archived and deleted from the operational Google Sheet as required by the privacy policy.',
      '',
      'Archive summary:',
      '  Registrations: ' + counts['Registrations'] + ' rows archived (aggregate count only — no PII)',
      '  Unconference Proposals: ' + counts['UnconferenceProposals'] + ' rows archived',
      '  DJ Signups: ' + counts['DJSignups'] + ' rows archived',
      '',
      'Archived at: ' + archiveTimestamp,
      '',
      'The "' + ARCHIVE_TAB_NAME + '" tab in the Google Sheet contains only aggregate counts — no personal information.',
      'Individual data rows have been permanently deleted.',
      '',
      '— Automated trigger',
    ].join('\n');

    GmailApp.sendEmail(organizerEmail, subject, body, {
      replyTo: 'hello@kinfusion.dance',
    });
    Logger.log('retention: notification sent to ' + organizerEmail);
  }

  return {
    action: 'deleted',
    counts: counts,
    archivedAt: archiveTimestamp,
  };
}

/**
 * Run once manually in Apps Script editor to install the daily trigger.
 * Idempotent — safe to run multiple times.
 */
function installRetentionTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runRetentionCheck') {
      Logger.log('installRetentionTrigger: trigger already installed');
      return;
    }
  }
  ScriptApp.newTrigger('runRetentionCheck')
    .timeBased()
    .everyDays(1)
    .atHour(2)
    .create();
  Logger.log('installRetentionTrigger: daily 02:00 UTC trigger installed');
}
