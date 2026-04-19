/**
 * 90-day post-event retention-delete trigger — ADR R8.2 / R8.3.
 *
 * On or after DELETE_AFTER_DATE (2026-12-12):
 *  1. Archives aggregate counts (no PII) to "KinFusion-2026-Archive" tab.
 *  2. Deletes all data rows from operational tabs (preserves header rows).
 *  3. Sends notification email to ORGANIZER_EMAIL Script Property.
 *
 * Before DELETE_AFTER_DATE: logs a no-op message and returns.
 *
 * Idempotency: uses Script Property RETENTION_COMPLETED_AT written only after
 * both archive and deletion succeed. Tab-existence check is a fallback only.
 *
 * Trigger: daily — install via installRetentionTrigger() once.
 */

// Named constant per ADR R8.2 — 90 days after event end 2026-09-13.
var DELETE_AFTER_DATE = new Date('2026-12-12T00:00:00Z');

var OPERATIONAL_TABS = ['Registrations', 'UnconferenceProposals', 'DJSignups'];
var ARCHIVE_TAB_NAME = 'KinFusion-2026-Archive';
var RETENTION_COMPLETED_PROP = 'RETENTION_COMPLETED_AT';

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

  // Fast path: check before acquiring lock to avoid unnecessary contention
  if (props.getProperty(RETENTION_COMPLETED_PROP)) {
    Logger.log('retention: already completed — idempotent skip (pre-lock)');
    return { action: 'noop', reason: 'already_completed' };
  }

  var sheetId = props.getProperty('SHEET_ID');
  var organizerEmail = props.getProperty('ORGANIZER_EMAIL');

  if (!sheetId) {
    Logger.log('retention: SHEET_ID not configured');
    return { action: 'error', reason: 'missing_sheet_id' };
  }

  // Acquire script lock to prevent concurrent executions from both passing the
  // idempotency check. waitLock throws if lock not acquired within 30 s.
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    // Re-check after acquiring lock: another execution may have completed first
    var completedAt = props.getProperty(RETENTION_COMPLETED_PROP);
    if (completedAt) {
      Logger.log('retention: already completed at ' + completedAt + ' — idempotent skip (post-lock)');
      return { action: 'noop', reason: 'already_completed' };
    }

    var ss = SpreadsheetApp.openById(sheetId);

    // Collect aggregate counts BEFORE any deletion
    var counts = {};
    var opSheets = {};
    for (var i = 0; i < OPERATIONAL_TABS.length; i++) {
      var tabName = OPERATIONAL_TABS[i];
      var sheet = ss.getSheetByName(tabName);
      opSheets[tabName] = sheet;
      counts[tabName] = sheet ? Math.max(0, sheet.getLastRow() - 1) : 0;
    }

    // Create or clear the archive tab
    var archiveSheet = ss.getSheetByName(ARCHIVE_TAB_NAME);
    if (!archiveSheet) {
      archiveSheet = ss.insertSheet(ARCHIVE_TAB_NAME);
    } else {
      archiveSheet.clearContents();
    }

    var archiveTimestamp = Utilities.formatDate(now, 'UTC', 'yyyy-MM-dd HH:mm:ss') + ' UTC';
    archiveSheet.appendRow(['archived_at', 'tab', 'row_count']);
    for (var j = 0; j < OPERATIONAL_TABS.length; j++) {
      var tab = OPERATIONAL_TABS[j];
      archiveSheet.appendRow([archiveTimestamp, tab, counts[tab]]);
    }
    archiveSheet.setFrozenRows(1);

    Logger.log('retention: archived counts — ' + JSON.stringify(counts));

    // Delete data rows using the previously-captured counts to avoid race condition
    for (var k = 0; k < OPERATIONAL_TABS.length; k++) {
      var opTabName = OPERATIONAL_TABS[k];
      var opSheet = opSheets[opTabName];
      var rowCount = counts[opTabName];
      if (opSheet && rowCount > 0) {
        opSheet.deleteRows(2, rowCount);
      }
    }

    Logger.log('retention: operational rows deleted');

    // Mark completion immediately after archive+delete — treat email as best-effort.
    // Writing the marker here ensures re-runs are blocked even if notification fails.
    props.setProperty(RETENTION_COMPLETED_PROP, archiveTimestamp);

  } finally {
    lock.releaseLock();
  }

  // Notification is best-effort: failure does NOT prevent completion from being recorded.
  if (organizerEmail) {
    try {
      var subject = 'Kin-Fusion Campout 2026 — 90-day retention process complete';
      var body = [
        'This is an automated notification from the Kin-Fusion Campout data retention trigger.',
        '',
        'Aggregate counts have been archived and personal data rows have been deleted from',
        'the operational Google Sheet, as required by the event privacy policy.',
        '',
        'Archive summary (aggregate counts only — no personal information retained):',
        '  Registrations: ' + counts['Registrations'] + ' rows deleted',
        '  Unconference Proposals: ' + counts['UnconferenceProposals'] + ' rows deleted',
        '  DJ Signups: ' + counts['DJSignups'] + ' rows deleted',
        '',
        'Completed at: ' + archiveTimestamp,
        '',
        'The "' + ARCHIVE_TAB_NAME + '" tab contains only the row counts above — no personal',
        'information. Individual data rows have been permanently deleted from operational tabs.',
        '',
        '— Automated trigger',
      ].join('\n');

      GmailApp.sendEmail(organizerEmail, subject, body, {
        replyTo: 'hello@kinfusion.dance',
      });
      Logger.log('retention: notification sent to ' + organizerEmail);
    } catch (e) {
      Logger.log('retention: notification failed (non-fatal) — ' + e.message);
    }
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
  // Note: Apps Script triggers run in the project timezone, not necessarily UTC.
  // Configure the project timezone to UTC (File -> Project settings -> Time zone) for predictable scheduling.
  ScriptApp.newTrigger('runRetentionCheck')
    .timeBased()
    .everyDays(1)
    .atHour(2)
    .create();
  Logger.log('installRetentionTrigger: daily hour-2 trigger installed (runs in project timezone)');
}
