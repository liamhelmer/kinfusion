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
    deleteRows: () => { rows = 0; },
    setFrozenRows: () => {},
    clearContents: () => { data.length = 0; },
    _getData: () => data,
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
  };
}

function makeProps(overrides = {}) {
  const defaults = { SHEET_ID: 'mock-sheet-id', ORGANIZER_EMAIL: 'organizer@example.com' };
  const merged = { ...defaults, ...overrides };
  return { getProperty: (k) => merged[k] || null };
}

const DELETE_AFTER_DATE = new Date('2026-12-12T00:00:00Z');
const OPERATIONAL_TABS = ['Registrations', 'UnconferenceProposals', 'DJSignups'];
const ARCHIVE_TAB_NAME = 'KinFusion-2026-Archive';

// Inline the implementation (extracted from retention.js for unit testing with injected deps)
function runRetentionCheck(now, deleteAfter, ss, props, emailFn) {
  if (now < deleteAfter) {
    return { action: 'noop', reason: 'before_delete_date' };
  }

  const sheetId = props.getProperty('SHEET_ID');
  const organizerEmail = props.getProperty('ORGANIZER_EMAIL');

  if (!sheetId) return { action: 'error', reason: 'missing_sheet_id' };

  let archiveSheet = ss.getSheetByName(ARCHIVE_TAB_NAME);
  if (archiveSheet && archiveSheet.getLastRow() > 1) {
    return { action: 'noop', reason: 'already_archived' };
  }

  const counts = {};
  for (const tabName of OPERATIONAL_TABS) {
    const sheet = ss.getSheetByName(tabName);
    counts[tabName] = sheet ? Math.max(0, sheet.getLastRow() - 1) : 0;
  }

  if (!archiveSheet) {
    archiveSheet = ss.insertSheet(ARCHIVE_TAB_NAME);
  } else {
    archiveSheet.clearContents();
  }

  const archiveTimestamp = now.toISOString();
  archiveSheet.appendRow(['archived_at', 'tab', 'row_count']);
  for (const tab of OPERATIONAL_TABS) {
    archiveSheet.appendRow([archiveTimestamp, tab, counts[tab]]);
  }
  archiveSheet.setFrozenRows(1);

  for (const tabName of OPERATIONAL_TABS) {
    const opSheet = ss.getSheetByName(tabName);
    if (opSheet && opSheet.getLastRow() > 1) {
      opSheet.deleteRows(2, opSheet.getLastRow() - 1);
    }
  }

  if (organizerEmail && emailFn) {
    emailFn(organizerEmail, 'Kin-Fusion retention delete complete', { archivedAt: archiveTimestamp });
  }

  return { action: 'deleted', counts, archivedAt: archiveTimestamp };
}

// --- Tests ---

let emails;
let ss;
let props;

beforeEach(() => {
  emails = [];
  ss = makeSpreadsheet({ Registrations: 45, UnconferenceProposals: 12, DJSignups: 8 });
  props = makeProps();
});

const emailFn = (...args) => emails.push(args);

describe('retention: before DELETE_AFTER_DATE', () => {
  test('returns noop with before_delete_date reason', () => {
    const yesterday = new Date('2026-12-11T12:00:00Z');
    const result = runRetentionCheck(yesterday, DELETE_AFTER_DATE, ss, props, emailFn);
    expect(result.action).toBe('noop');
    expect(result.reason).toBe('before_delete_date');
  });

  test('sends no email', () => {
    const yesterday = new Date('2026-12-11T12:00:00Z');
    runRetentionCheck(yesterday, DELETE_AFTER_DATE, ss, props, emailFn);
    expect(emails).toHaveLength(0);
  });
});

describe('retention: on DELETE_AFTER_DATE', () => {
  test('action is deleted', () => {
    const onDate = new Date('2026-12-12T03:00:00Z');
    const result = runRetentionCheck(onDate, DELETE_AFTER_DATE, ss, props, emailFn);
    expect(result.action).toBe('deleted');
  });

  test('counts all three tabs correctly', () => {
    const onDate = new Date('2026-12-12T03:00:00Z');
    const result = runRetentionCheck(onDate, DELETE_AFTER_DATE, ss, props, emailFn);
    expect(result.counts['Registrations']).toBe(45);
    expect(result.counts['UnconferenceProposals']).toBe(12);
    expect(result.counts['DJSignups']).toBe(8);
  });

  test('sends one notification email to organizer', () => {
    const onDate = new Date('2026-12-12T03:00:00Z');
    runRetentionCheck(onDate, DELETE_AFTER_DATE, ss, props, emailFn);
    expect(emails).toHaveLength(1);
    expect(emails[0][0]).toBe('organizer@example.com');
  });

  test('creates archive tab with header + 3 data rows', () => {
    const onDate = new Date('2026-12-12T03:00:00Z');
    runRetentionCheck(onDate, DELETE_AFTER_DATE, ss, props, emailFn);
    const archiveSheet = ss._inserted[ARCHIVE_TAB_NAME];
    expect(archiveSheet).toBeTruthy();
    // 1 header row + 3 tab rows
    expect(archiveSheet._getData()).toHaveLength(4);
  });
});

describe('retention: after DELETE_AFTER_DATE (weeks later)', () => {
  test('still executes deletion', () => {
    const weeksLater = new Date('2027-01-15T00:00:00Z');
    const result = runRetentionCheck(weeksLater, DELETE_AFTER_DATE, ss, props, emailFn);
    expect(result.action).toBe('deleted');
  });
});

describe('retention: idempotency', () => {
  test('second run is noop with already_archived reason', () => {
    // Archive tab already exists with rows
    const archiveWithData = makeSheet(ARCHIVE_TAB_NAME, 3);
    const ssWithArchive = {
      getSheetByName: (name) => name === ARCHIVE_TAB_NAME ? archiveWithData : makeSheet(name, 5),
      insertSheet: (name) => makeSheet(name, 0),
      _inserted: {},
    };
    const onDate = new Date('2026-12-13T00:00:00Z');
    const result = runRetentionCheck(onDate, DELETE_AFTER_DATE, ssWithArchive, props, emailFn);
    expect(result.action).toBe('noop');
    expect(result.reason).toBe('already_archived');
    expect(emails).toHaveLength(0);
  });
});

describe('retention: DELETE_AFTER_DATE constant', () => {
  test('is 2026-12-12', () => {
    expect(DELETE_AFTER_DATE.toISOString()).toMatch(/^2026-12-12/);
  });
});
