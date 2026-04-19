/**
 * Unit tests for retention.js logic using GAS API mocks.
 * Runs under vitest (npm test) — GAS globals are mocked here.
 */
import { describe, test, expect, beforeEach } from 'vitest';

// --- GAS API mocks ---

function makeSheet(name, dataRowCount) {
  let rows = dataRowCount;
  const data = [];
  return {
    getName: () => name,
    getLastRow: () => rows + 1,
    appendRow: (row) => { data.push(row); },
    deleteRows: (start, count) => { rows = Math.max(0, rows - count); },
    setFrozenRows: () => {},
    clearContents: () => { data.length = 0; },
    _getData: () => data,
    _getRows: () => rows,
  };
}

function makeSpreadsheet(tabCounts) {
  const sheets = {};
  for (const [name, count] of Object.entries(tabCounts)) {
    sheets[name] = makeSheet(name, count);
  }
  const inserted = {};
  return {
    getSheetByName: (name) => sheets[name] || inserted[name] || null,
    insertSheet: (name) => {
      inserted[name] = makeSheet(name, 0);
      return inserted[name];
    },
    _inserted: inserted,
    _sheets: sheets,
  };
}

const DELETE_AFTER_DATE = new Date('2026-12-12T00:00:00Z');
const OPERATIONAL_TABS = ['Registrations', 'UnconferenceProposals', 'DJSignups'];
const ARCHIVE_TAB_NAME = 'KinFusion-2026-Archive';
const RETENTION_COMPLETED_PROP = 'RETENTION_COMPLETED_AT';

// Inline the implementation (mirrors retention.js with injected deps for testing)
function runRetentionCheck(now, deleteAfter, ss, props, emailFn) {
  if (now < deleteAfter) {
    return { action: 'noop', reason: 'before_delete_date' };
  }

  const completedAt = props.getProperty(RETENTION_COMPLETED_PROP);
  if (completedAt) {
    return { action: 'noop', reason: 'already_completed' };
  }

  const sheetId = props.getProperty('SHEET_ID');
  const organizerEmail = props.getProperty('ORGANIZER_EMAIL');
  if (!sheetId) return { action: 'error', reason: 'missing_sheet_id' };

  // Capture counts and sheet refs before any mutation
  const counts = {};
  const opSheets = {};
  for (const tabName of OPERATIONAL_TABS) {
    const sheet = ss.getSheetByName(tabName);
    opSheets[tabName] = sheet;
    counts[tabName] = sheet ? Math.max(0, sheet.getLastRow() - 1) : 0;
  }

  let archiveSheet = ss.getSheetByName(ARCHIVE_TAB_NAME);
  if (!archiveSheet) {
    archiveSheet = ss.insertSheet(ARCHIVE_TAB_NAME);
  } else {
    archiveSheet.clearContents();
  }

  const archiveTimestamp = now.toISOString() + ' UTC';
  archiveSheet.appendRow(['archived_at', 'tab', 'row_count']);
  for (const tab of OPERATIONAL_TABS) {
    archiveSheet.appendRow([archiveTimestamp, tab, counts[tab]]);
  }
  archiveSheet.setFrozenRows(1);

  // Delete using previously-captured counts (avoids race condition)
  for (const tabName of OPERATIONAL_TABS) {
    const opSheet = opSheets[tabName];
    const rowCount = counts[tabName];
    if (opSheet && rowCount > 0) {
      opSheet.deleteRows(2, rowCount);
    }
  }

  if (organizerEmail && emailFn) {
    emailFn(organizerEmail, 'Kin-Fusion retention complete', { archivedAt: archiveTimestamp });
  }

  // Mark completion only after all steps succeed
  props.setProperty(RETENTION_COMPLETED_PROP, archiveTimestamp);

  return { action: 'deleted', counts, archivedAt: archiveTimestamp };
}

// --- Test state ---

let emails;
let ss;
let scriptProps;

function makeProps(overrides = {}) {
  const store = { SHEET_ID: 'mock-sheet-id', ORGANIZER_EMAIL: 'organizer@example.com', ...overrides };
  return {
    getProperty: (k) => store[k] || null,
    setProperty: (k, v) => { store[k] = v; },
    _store: store,
  };
}

beforeEach(() => {
  emails = [];
  ss = makeSpreadsheet({ Registrations: 45, UnconferenceProposals: 12, DJSignups: 8 });
  scriptProps = makeProps();
});

const emailFn = (...args) => emails.push(args);

describe('retention: before DELETE_AFTER_DATE', () => {
  test('returns noop with before_delete_date reason', () => {
    const yesterday = new Date('2026-12-11T12:00:00Z');
    const result = runRetentionCheck(yesterday, DELETE_AFTER_DATE, ss, scriptProps, emailFn);
    expect(result.action).toBe('noop');
    expect(result.reason).toBe('before_delete_date');
  });

  test('sends no email', () => {
    const yesterday = new Date('2026-12-11T12:00:00Z');
    runRetentionCheck(yesterday, DELETE_AFTER_DATE, ss, scriptProps, emailFn);
    expect(emails).toHaveLength(0);
  });
});

describe('retention: on DELETE_AFTER_DATE', () => {
  test('action is deleted', () => {
    const onDate = new Date('2026-12-12T03:00:00Z');
    const result = runRetentionCheck(onDate, DELETE_AFTER_DATE, ss, scriptProps, emailFn);
    expect(result.action).toBe('deleted');
  });

  test('counts all three tabs correctly', () => {
    const onDate = new Date('2026-12-12T03:00:00Z');
    const result = runRetentionCheck(onDate, DELETE_AFTER_DATE, ss, scriptProps, emailFn);
    expect(result.counts['Registrations']).toBe(45);
    expect(result.counts['UnconferenceProposals']).toBe(12);
    expect(result.counts['DJSignups']).toBe(8);
  });

  test('sends one notification email to organizer', () => {
    const onDate = new Date('2026-12-12T03:00:00Z');
    runRetentionCheck(onDate, DELETE_AFTER_DATE, ss, scriptProps, emailFn);
    expect(emails).toHaveLength(1);
    expect(emails[0][0]).toBe('organizer@example.com');
  });

  test('creates archive tab with header + 3 data rows', () => {
    const onDate = new Date('2026-12-12T03:00:00Z');
    runRetentionCheck(onDate, DELETE_AFTER_DATE, ss, scriptProps, emailFn);
    const archiveSheet = ss._inserted[ARCHIVE_TAB_NAME];
    expect(archiveSheet).toBeTruthy();
    expect(archiveSheet._getData()).toHaveLength(4); // 1 header + 3 tabs
  });

  test('writes RETENTION_COMPLETED_AT script property after success', () => {
    const onDate = new Date('2026-12-12T03:00:00Z');
    runRetentionCheck(onDate, DELETE_AFTER_DATE, ss, scriptProps, emailFn);
    expect(scriptProps._store[RETENTION_COMPLETED_PROP]).toBeTruthy();
  });

  test('deletes rows using pre-captured counts (no race with getLastRow)', () => {
    const onDate = new Date('2026-12-12T03:00:00Z');
    runRetentionCheck(onDate, DELETE_AFTER_DATE, ss, scriptProps, emailFn);
    // Registrations had 45 data rows; after deleteRows(2, 45) → 0 data rows
    expect(ss._sheets['Registrations']._getRows()).toBe(0);
  });
});

describe('retention: after DELETE_AFTER_DATE (weeks later)', () => {
  test('still executes deletion', () => {
    const weeksLater = new Date('2027-01-15T00:00:00Z');
    const result = runRetentionCheck(weeksLater, DELETE_AFTER_DATE, ss, scriptProps, emailFn);
    expect(result.action).toBe('deleted');
  });
});

describe('retention: idempotency via RETENTION_COMPLETED_AT property', () => {
  test('second run returns noop with already_completed reason', () => {
    const onDate = new Date('2026-12-13T00:00:00Z');
    // First run
    runRetentionCheck(onDate, DELETE_AFTER_DATE, ss, scriptProps, emailFn);
    const firstEmailCount = emails.length;
    // Second run with same props (RETENTION_COMPLETED_AT is now set)
    const result = runRetentionCheck(onDate, DELETE_AFTER_DATE, ss, scriptProps, emailFn);
    expect(result.action).toBe('noop');
    expect(result.reason).toBe('already_completed');
    expect(emails.length).toBe(firstEmailCount); // no second email
  });

  test('pre-existing RETENTION_COMPLETED_AT blocks execution', () => {
    const propsWithCompletion = makeProps({ RETENTION_COMPLETED_AT: '2026-12-12T03:00:00.000Z UTC' });
    const result = runRetentionCheck(new Date('2026-12-13T00:00:00Z'), DELETE_AFTER_DATE, ss, propsWithCompletion, emailFn);
    expect(result.action).toBe('noop');
    expect(result.reason).toBe('already_completed');
  });
});

describe('retention: DELETE_AFTER_DATE constant', () => {
  test('is 2026-12-12', () => {
    expect(DELETE_AFTER_DATE.toISOString()).toMatch(/^2026-12-12/);
  });
});
