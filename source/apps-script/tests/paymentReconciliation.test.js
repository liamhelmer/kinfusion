import { beforeEach, describe, expect, test, vi } from 'vitest';
import '../paymentHelpers.js';
import '../paymentReconciliation.js';

class FakeRange {
  constructor(sheet, row, col, rows = 1, cols = 1) {
    this.sheet = sheet; this.row = row; this.col = col; this.rows = rows; this.cols = cols;
  }
  getValues() {
    return Array.from({ length: this.rows }, (_, r) =>
      Array.from({ length: this.cols }, (_, c) => this.sheet.cell(this.row + r, this.col + c)));
  }
  setValues(values) {
    if (this.sheet.failWrites) throw new Error('simulated sheet failure');
    values.forEach((line, r) => line.forEach((value, c) => this.sheet.setCell(this.row + r, this.col + c, value)));
    return this;
  }
  getFormulasR1C1() {
    return Array.from({ length: this.rows }, (_, r) =>
      Array.from({ length: this.cols }, (_, c) => this.sheet.formula(this.row + r, this.col + c)));
  }
  setFormulasR1C1(values) {
    if (this.sheet.failFormulaWrites) throw new Error('simulated formula failure');
    values.forEach((line, r) => line.forEach((value, c) => this.sheet.setFormula(this.row + r, this.col + c, value)));
    return this;
  }
}

class FakeSheet {
  constructor(name, rows) {
    this.name = name;
    this.data = rows.map((row) => [...row]);
    this.formulas = {};
    this.hidden = [];
    this.failWrites = false;
    this.failFormulaWrites = false;
  }
  getName() { return this.name; }
  getLastRow() { return this.data.length; }
  getLastColumn() { return Math.max(0, ...this.data.map((row) => row.length)); }
  getRange(row, col, rows = 1, cols = 1) { return new FakeRange(this, row, col, rows, cols); }
  hideColumns(start, count) { this.hidden.push([start, count]); }
  cell(row, col) { return this.data[row - 1]?.[col - 1] ?? ''; }
  setCell(row, col, value) {
    while (this.data.length < row) this.data.push([]);
    while (this.data[row - 1].length < col) this.data[row - 1].push('');
    this.data[row - 1][col - 1] = value;
  }
  formula(row, col) { return this.formulas[`${row}:${col}`] || ''; }
  setFormula(row, col, value) { if (value) this.formulas[`${row}:${col}`] = value; }
}

const paymentHeaders = [
  'Timestamp', 'RefCode', 'FullName', 'Email', 'Pronouns', "Amount rec'd",
  'Accommodation', 'Notes', 'Donation', 'Emailed', 'Total paid', 'Total unpaid',
];
const auditHeaders = ['Gmail Message ID', 'Gmail Received At', 'Reconciled At', 'Reconciliation Status'];
const registrationHeaders = ['RefCode', 'FullName', 'Email', 'Pronouns', 'Accommodation', 'Donation', 'PaymentStatus'];

function makeFixture({ paymentSheetMissing = false } = {}) {
  globalThis.assertController_ = vi.fn();
  const payments = paymentSheetMissing ? null : new FakeSheet('Pmts Received', [
    paymentHeaders,
    ['old', 'KF-AB123', 'Alex Bee', 'alex@example.com', 'they', 25, 'Tent', '', 0, '', 25, 75],
  ]);
  if (payments) {
    payments.setFormula(2, 11, '=SUMIF(R2C2:RC[-9],RC2,R2C6:RC[-5])');
    payments.setFormula(2, 12, '=100-RC[-1]');
  }
  const registrations = new FakeSheet('Registrations', [
    registrationHeaders,
    ['KF-AB123', 'Alex Bee', 'alex@example.com', 'they', 'Tent', 0, 'unpaid'],
    ['KF-CD456', 'Casey Dee', 'casey@example.com', 'she', 'Cabin', 10, 'manual-review'],
  ]);
  const sheets = { Registrations: registrations };
  if (payments) sheets['Pmts Received'] = payments;
  const spreadsheet = {
    insertions: [],
    getSheetByName: (name) => sheets[name] || null,
    insertSheet(name) {
      const sheet = new FakeSheet(name, []);
      sheets[name] = sheet;
      this.insertions.push(name);
      return sheet;
    },
  };
  const lock = { waitLock: vi.fn(), releaseLock: vi.fn() };
  globalThis.PropertiesService = { getScriptProperties: () => ({ getProperty: () => 'sheet-id' }) };
  globalThis.SpreadsheetApp = { openById: vi.fn(() => spreadsheet), flush: vi.fn() };
  globalThis.LockService = { getScriptLock: () => lock };
  globalThis.paymentValidateAllocations_ = globalThis.__kinfusionPaymentHelpers.paymentValidateAllocations_;
  globalThis.paymentCompareBalance_ = globalThis.__kinfusionPaymentHelpers.paymentCompareBalance_;
  globalThis.paymentHeaderIndex_ = globalThis.__kinfusionPaymentHelpers.paymentHeaderIndex_;
  globalThis.paymentCandidateBoundary_ = vi.fn(() => ({ ok: true, retry: false }));
  globalThis.paymentApplyLabel_ = vi.fn(() => ({ ok: true, labelId: 'Label_1' }));
  return { payments, registrations, lock, spreadsheet, sheets };
}

const approval = () => ({
  messageId: 'msg-1',
  receivedAt: '2026-08-20T15:00:00.000Z',
  allocations: [{ refCode: 'KF-AB123', amountCents: 7500, notes: 'Balance paid' }],
});

beforeEach(() => vi.useFakeTimers().setSystemTime(new Date('2026-08-21T01:02:03.000Z')));

describe('payment reconciliation sheet setup', () => {
  test('requires controller access before changing the sheet', () => {
    makeFixture();
    globalThis.assertController_ = vi.fn(() => { throw new Error('controller_access_required'); });
    expect(() => globalThis.setupPaymentReconciliationSheet()).toThrow('controller_access_required');
    expect(globalThis.SpreadsheetApp.openById).not.toHaveBeenCalled();
  });

  test('creates the canonical payment sheet once when it is missing', () => {
    const { spreadsheet, sheets } = makeFixture({ paymentSheetMissing: true });

    expect(globalThis.setupPaymentReconciliationSheet()).toEqual({
      ok: true,
      addedHeaders: auditHeaders,
      auditColumnStart: 13,
    });
    expect(sheets['Pmts Received'].data[0]).toEqual([...paymentHeaders, ...auditHeaders]);
    expect(sheets['Pmts Received'].hidden).toEqual([[13, 4]]);
    expect(spreadsheet.insertions).toEqual(['Pmts Received']);

    expect(globalThis.setupPaymentReconciliationSheet()).toEqual({
      ok: true,
      addedHeaders: [],
      auditColumnStart: 13,
    });
    expect(spreadsheet.insertions).toEqual(['Pmts Received']);
  });

  test('adds and hides only the four audit headers', () => {
    const { payments } = makeFixture();
    expect(globalThis.setupPaymentReconciliationSheet()).toEqual({
      ok: true,
      addedHeaders: auditHeaders,
      auditColumnStart: 13,
    });
    expect(payments.data[0]).toEqual([...paymentHeaders, ...auditHeaders]);
    expect(payments.hidden).toEqual([[13, 4]]);
  });
});

describe('approved payment reconciliation', () => {
  test('appends a complete allocation, copies formulas, labels it, and updates a clear status', () => {
    const { payments, registrations, lock } = makeFixture();
    const result = globalThis.approvePaymentReconciliation(approval());

    expect(result.ok).toBe(true);
    expect(result.duplicate).toBe(false);
    expect(result.sheetRows).toEqual([3]);
    expect(payments.data[2].slice(0, 10)).toEqual([
      '2026-08-21T01:02:03.000Z', 'KF-AB123', 'Alex Bee', 'alex@example.com', 'they', 75,
      'Tent', 'Balance paid', 0, '',
    ]);
    expect(payments.data[2].slice(12)).toEqual([
      'msg-1', '2026-08-20T15:00:00.000Z', '2026-08-21T01:02:03.000Z', 'approved',
    ]);
    expect(payments.formula(3, 11)).toContain('SUMIF');
    expect(payments.formula(3, 12)).toBe('=100-RC[-1]');
    expect(registrations.cell(2, 7)).toBe('paid');
    expect(result.paymentStatuses).toEqual([{ refCode: 'KF-AB123', status: 'paid', registrationRow: 2 }]);
    expect(lock.waitLock).toHaveBeenCalledWith(30000);
    expect(lock.releaseLock).toHaveBeenCalledOnce();
  });

  test('leaves label-pending after Gmail failure and retries without another append', () => {
    const { payments } = makeFixture();
    globalThis.paymentApplyLabel_.mockReturnValueOnce({ ok: false, error: 'gmail_api_error' });

    const first = globalThis.approvePaymentReconciliation(approval());
    expect(first).toMatchObject({ ok: false, error: 'gmail_api_error', labelPending: true, sheetRows: [3] });
    expect(payments.cell(3, 16)).toBe('label-pending');

    globalThis.paymentCandidateBoundary_.mockImplementation(() => { throw new Error('boundary scan not needed for retry'); });
    const second = globalThis.approvePaymentReconciliation(approval());
    expect(second).toMatchObject({ ok: true, duplicate: true, recovered: true, sheetRows: [3] });
    expect(payments.data).toHaveLength(3);
    expect(payments.cell(3, 16)).toBe('approved');
  });

  test('preserves recovery context when Gmail labeling throws', () => {
    const { payments } = makeFixture();
    globalThis.paymentApplyLabel_.mockImplementationOnce(() => { throw new Error('simulated Gmail outage'); });

    const result = globalThis.approvePaymentReconciliation(approval());

    expect(result).toMatchObject({
      ok: false,
      error: 'gmail_label_failed',
      labelPending: true,
      gmailLabeled: false,
      sheetRows: [3],
      paymentStatuses: [{ refCode: 'KF-AB123', status: 'paid', registrationRow: 2 }],
    });
    expect(payments.cell(3, 16)).toBe('label-pending');
  });

  test('reports a labeled message when the final sheet status write fails', () => {
    const { payments } = makeFixture();
    globalThis.paymentApplyLabel_.mockImplementationOnce(() => {
      payments.failWrites = true;
      return { ok: true, labelId: 'Label_1' };
    });

    const result = globalThis.approvePaymentReconciliation(approval());

    expect(result).toMatchObject({
      ok: false,
      error: 'spreadsheet_finalize_failed',
      labelPending: true,
      gmailLabeled: true,
      sheetRows: [3],
      gmail: { messageId: 'msg-1', label: 'kinfusion-etransfer' },
    });
    expect(payments.cell(3, 16)).toBe('label-pending');
  });

  test('preserves row context when registration status reconciliation throws', () => {
    const { payments, registrations } = makeFixture();
    registrations.failWrites = true;

    const result = globalThis.approvePaymentReconciliation(approval());

    expect(result).toMatchObject({
      ok: false,
      error: 'spreadsheet_status_update_failed',
      labelPending: true,
      gmailLabeled: false,
      sheetRows: [3],
      paymentStatuses: [],
    });
    expect(globalThis.paymentApplyLabel_).not.toHaveBeenCalled();
    expect(payments.cell(3, 16)).toBe('label-pending');
  });

  test('repairs formulas after a partial sheet initialization failure before labeling', () => {
    const { payments } = makeFixture();
    payments.failFormulaWrites = true;

    const first = globalThis.approvePaymentReconciliation(approval());
    expect(first).toMatchObject({ ok: false, error: 'spreadsheet_write_failed', labelPending: true, sheetRows: [3] });
    expect(globalThis.paymentApplyLabel_).not.toHaveBeenCalled();

    payments.failFormulaWrites = false;
    const second = globalThis.approvePaymentReconciliation(approval());
    expect(second).toMatchObject({ ok: true, duplicate: true, recovered: true, sheetRows: [3] });
    expect(payments.formula(3, 11)).toContain('SUMIF');
    expect(payments.formula(3, 12)).toBe('=100-RC[-1]');
    expect(payments.cell(3, 16)).toBe('approved');
  });

  test('returns an approved duplicate without writing or labeling again', () => {
    const { payments } = makeFixture();
    globalThis.approvePaymentReconciliation(approval());
    globalThis.paymentApplyLabel_.mockClear();

    const result = globalThis.approvePaymentReconciliation(approval());
    expect(result).toMatchObject({ ok: true, duplicate: true, recovered: false, sheetRows: [3] });
    expect(payments.data).toHaveLength(3);
    expect(globalThis.paymentApplyLabel_).not.toHaveBeenCalled();
  });

  test('does not label when the spreadsheet append fails', () => {
    const { payments } = makeFixture();
    payments.failWrites = true;
    const result = globalThis.approvePaymentReconciliation(approval());
    expect(result).toEqual({ ok: false, error: 'spreadsheet_write_failed' });
    expect(globalThis.paymentApplyLabel_).not.toHaveBeenCalled();
  });

  test('preserves exceptional manual statuses and reports the skip', () => {
    const { payments, registrations } = makeFixture();
    payments.data[1] = ['old', 'KF-CD456', 'Casey Dee', 'casey@example.com', 'she', 25, 'Cabin', '', 10, '', 25, 75];
    const payload = approval();
    payload.allocations[0] = { refCode: 'KF-CD456', amountCents: 2500, notes: 'Partial' };

    const result = globalThis.approvePaymentReconciliation(payload);
    expect(registrations.cell(3, 7)).toBe('manual-review');
    expect(result.paymentStatuses).toEqual([{
      refCode: 'KF-CD456',
      status: 'partial',
      registrationRow: 3,
      skipped: 'manual_status_preserved',
    }]);
  });

  test('treats conflicting expected totals as unclear', () => {
    const { payments, registrations } = makeFixture();
    payments.data.push(['other', 'KF-AB123', 'Alex Bee', 'alex@example.com', 'they', 5, 'Tent', '', 0, '', 30, 80]);

    const result = globalThis.approvePaymentReconciliation(approval());
    expect(registrations.cell(2, 7)).toBe('unpaid');
    expect(result.paymentStatuses).toEqual([{
      refCode: 'KF-AB123', status: 'unclear', registrationRow: 2, skipped: 'organizer_instruction_required',
    }]);
  });

  test('reports an overpayment without changing the automatic status', () => {
    const { registrations } = makeFixture();
    const payload = approval();
    payload.allocations[0].amountCents = 8000;

    const result = globalThis.approvePaymentReconciliation(payload);
    expect(registrations.cell(2, 7)).toBe('unpaid');
    expect(result.paymentStatuses[0]).toMatchObject({ status: 'overpaid', skipped: 'organizer_instruction_required' });
  });
});
