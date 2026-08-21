/** Human-approved, idempotent payment-to-spreadsheet reconciliation. */

var PAYMENT_SHEET_NAME = 'Pmts Received';
var PAYMENT_REGISTRATION_SHEET_NAME = 'Registrations';
var PAYMENT_AUDIT_HEADERS = [
  'Gmail Message ID',
  'Gmail Received At',
  'Reconciled At',
  'Reconciliation Status',
];
var PAYMENT_VISIBLE_HEADERS = [
  'Timestamp', 'RefCode', 'FullName', 'Email', 'Pronouns', "Amount rec'd",
  'Accommodation', 'Notes', 'Donation', 'Emailed', 'Total paid', 'Total unpaid',
];

function _paymentOpenSpreadsheet() {
  var sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!sheetId) throw new Error('missing_sheet_id');
  return SpreadsheetApp.openById(sheetId);
}

function _paymentHeaders(sheet) {
  var columns = sheet.getLastColumn();
  return columns ? sheet.getRange(1, 1, 1, columns).getValues()[0] : [];
}

function _paymentEnsureAuditColumns(sheet) {
  var headers = _paymentHeaders(sheet);
  var index = _paymentHeaderIndex(headers);
  for (var i = 0; i < PAYMENT_VISIBLE_HEADERS.length; i++) {
    if (index[PAYMENT_VISIBLE_HEADERS[i]] === undefined) {
      throw new Error('missing_payment_header:' + PAYMENT_VISIBLE_HEADERS[i]);
    }
  }
  var added = [];
  for (var j = 0; j < PAYMENT_AUDIT_HEADERS.length; j++) {
    var auditHeader = PAYMENT_AUDIT_HEADERS[j];
    if (index[auditHeader] === undefined) {
      var nextColumn = headers.length + 1;
      sheet.getRange(1, nextColumn).setValues([[auditHeader]]);
      headers.push(auditHeader);
      index[auditHeader] = nextColumn - 1;
      added.push(auditHeader);
    }
  }
  var positions = PAYMENT_AUDIT_HEADERS.map(function (header) { return index[header] + 1; });
  var first = Math.min.apply(null, positions);
  var contiguous = positions.every(function (position, offset) { return position === first + offset; });
  if (contiguous) sheet.hideColumns(first, PAYMENT_AUDIT_HEADERS.length);
  else positions.forEach(function (position) { sheet.hideColumns(position, 1); });
  return { headers: headers, index: index, addedHeaders: added, auditColumnStart: first };
}

function setupPaymentReconciliationSheet() {
  try {
    var ss = _paymentOpenSpreadsheet();
    var sheet = ss.getSheetByName(PAYMENT_SHEET_NAME);
    if (!sheet) return { ok: false, error: 'payment_sheet_missing' };
    var setup = _paymentEnsureAuditColumns(sheet);
    return { ok: true, addedHeaders: setup.addedHeaders, auditColumnStart: setup.auditColumnStart };
  } catch (error) {
    return { ok: false, error: 'spreadsheet_setup_failed', detail: String(error.message || error) };
  }
}

function _paymentReadRows(sheet, headers) {
  var count = Math.max(0, sheet.getLastRow() - 1);
  return count ? sheet.getRange(2, 1, count, headers.length).getValues() : [];
}

function _paymentFindMessageGroup(rows, index, messageId) {
  var result = [];
  var column = index['Gmail Message ID'];
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][column] || '') === messageId) result.push({ rowNumber: i + 2, values: rows[i] });
  }
  return result;
}

function _paymentStoredGroupMatches(group, index, allocations) {
  if (group.length !== allocations.length) return false;
  var expected = allocations.map(function (allocation) {
    return [allocation.refCode, allocation.amountCents, allocation.notes].join('\u0000');
  }).sort();
  var actual = group.map(function (entry) {
    return [
      String(entry.values[index.RefCode] || '').trim().toUpperCase(),
      Math.round(Number(entry.values[index["Amount rec'd"]]) * 100),
      String(entry.values[index.Notes] || '').trim(),
    ].join('\u0000');
  }).sort();
  return expected.join('\u0001') === actual.join('\u0001');
}

function _paymentRegistrationContext(sheet) {
  var headers = _paymentHeaders(sheet);
  var index = _paymentHeaderIndex(headers);
  if (index.RefCode === undefined || index.PaymentStatus === undefined) {
    throw new Error('registration_headers_missing');
  }
  var rows = _paymentReadRows(sheet, headers);
  var byRef = {};
  rows.forEach(function (row, offset) {
    var refCode = String(row[index.RefCode] || '').trim().toUpperCase();
    if (refCode) byRef[refCode] = { rowNumber: offset + 2, values: row };
  });
  return { headers: headers, index: index, rows: rows, byRef: byRef };
}

function _paymentBuildAllocationRows(payload, paymentSetup, registration, reconciledAt) {
  return payload.allocations.map(function (allocation) {
    var row = new Array(paymentSetup.headers.length).fill('');
    var registrationRow = registration.byRef[allocation.refCode];
    if (!registrationRow) throw new Error('registration_not_found:' + allocation.refCode);
    var reg = registrationRow.values;
    var regIndex = registration.index;
    var paymentIndex = paymentSetup.index;
    row[paymentIndex.Timestamp] = reconciledAt;
    row[paymentIndex.RefCode] = allocation.refCode;
    row[paymentIndex.FullName] = regIndex.FullName === undefined ? '' : reg[regIndex.FullName];
    row[paymentIndex.Email] = regIndex.Email === undefined ? '' : reg[regIndex.Email];
    row[paymentIndex.Pronouns] = regIndex.Pronouns === undefined ? '' : reg[regIndex.Pronouns];
    row[paymentIndex["Amount rec'd"]] = allocation.amountCents / 100;
    row[paymentIndex.Accommodation] = regIndex.Accommodation === undefined ? '' : reg[regIndex.Accommodation];
    row[paymentIndex.Notes] = allocation.notes;
    row[paymentIndex.Donation] = regIndex.Donation === undefined ? '' : reg[regIndex.Donation];
    row[paymentIndex['Gmail Message ID']] = payload.messageId;
    row[paymentIndex['Gmail Received At']] = payload.receivedAt;
    row[paymentIndex['Reconciled At']] = reconciledAt;
    row[paymentIndex['Reconciliation Status']] = 'label-pending';
    return row;
  });
}

function _paymentCopyNewRowFormulas(sheet, setup, startRow, rowCount) {
  var sourceRows = startRow - 2;
  ['Total paid', 'Total unpaid'].forEach(function (header) {
    var column = setup.index[header] + 1;
    if (sourceRows <= 0) return;
    var formulas = sheet.getRange(2, column, sourceRows, 1).getFormulasR1C1();
    var sourceFormula = '';
    for (var i = formulas.length - 1; i >= 0; i--) {
      if (formulas[i][0]) { sourceFormula = formulas[i][0]; break; }
    }
    if (!sourceFormula) return;
    var destination = [];
    for (var j = 0; j < rowCount; j++) destination.push([sourceFormula]);
    sheet.getRange(startRow, column, rowCount, 1).setFormulasR1C1(destination);
  });
}

function _paymentExpectedTotals(rows, index) {
  var expected = {};
  rows.forEach(function (row) {
    var refCode = String(row[index.RefCode] || '').trim().toUpperCase();
    var paid = Number(row[index['Total paid']]);
    var unpaid = Number(row[index['Total unpaid']]);
    if (refCode && isFinite(paid) && isFinite(unpaid) && paid >= 0 && unpaid >= 0 && (paid + unpaid) > 0) {
      expected[refCode] = Math.round((paid + unpaid) * 100);
    }
  });
  return expected;
}

function _paymentUpdateRegistrationStatuses(paymentSheet, setup, registrationSheet, affectedRefs, currentMessageId) {
  SpreadsheetApp.flush();
  var rows = _paymentReadRows(paymentSheet, setup.headers);
  var paidTotals = {};
  var expectedTotals = _paymentExpectedTotals(rows, setup.index);
  rows.forEach(function (row) {
    var refCode = String(row[setup.index.RefCode] || '').trim().toUpperCase();
    var status = String(row[setup.index['Reconciliation Status']] || '');
    var messageId = String(row[setup.index['Gmail Message ID']] || '');
    var countable = !status || status === 'approved' || (status === 'label-pending' && messageId === currentMessageId);
    if (refCode && countable) {
      paidTotals[refCode] = (paidTotals[refCode] || 0) + Math.round(Number(row[setup.index["Amount rec'd"]] || 0) * 100);
    }
  });

  var registration = _paymentRegistrationContext(registrationSheet);
  var reports = [];
  affectedRefs.forEach(function (refCode) {
    var entry = registration.byRef[refCode];
    if (!entry) {
      reports.push({ refCode: refCode, status: 'unclear', skipped: 'registration_not_found' });
      return;
    }
    var status = _paymentCompareBalance(paidTotals[refCode] || 0, expectedTotals[refCode]);
    var report = { refCode: refCode, status: status, registrationRow: entry.rowNumber };
    if (status === 'unclear' || status === 'overpaid') {
      report.skipped = 'organizer_instruction_required';
      reports.push(report);
      return;
    }
    var current = String(entry.values[registration.index.PaymentStatus] || '').trim().toLowerCase();
    if (['', 'unpaid', 'partial', 'paid'].indexOf(current) === -1) {
      report.skipped = 'manual_status_preserved';
      reports.push(report);
      return;
    }
    registrationSheet.getRange(entry.rowNumber, registration.index.PaymentStatus + 1).setValues([[status]]);
    reports.push(report);
  });
  return reports;
}

function _paymentSetGroupStatus(paymentSheet, setup, group, status) {
  var column = setup.index['Reconciliation Status'] + 1;
  group.forEach(function (entry) {
    paymentSheet.getRange(entry.rowNumber, column).setValues([[status]]);
  });
}

function _paymentHasPendingMessage(messageId) {
  try {
    var ss = _paymentOpenSpreadsheet();
    var sheet = ss.getSheetByName(PAYMENT_SHEET_NAME);
    if (!sheet) return false;
    var setup = _paymentEnsureAuditColumns(sheet);
    return _paymentFindMessageGroup(_paymentReadRows(sheet, setup.headers), setup.index, String(messageId))
      .some(function (entry) { return entry.values[setup.index['Reconciliation Status']] === 'label-pending'; });
  } catch (error) {
    return false;
  }
}

function approvePaymentReconciliation(rawPayload) {
  var validation = _paymentValidateAllocations(rawPayload);
  if (!validation.ok) return validation;
  var payload = validation.value;
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = _paymentOpenSpreadsheet();
    var paymentSheet = ss.getSheetByName(PAYMENT_SHEET_NAME);
    var registrationSheet = ss.getSheetByName(PAYMENT_REGISTRATION_SHEET_NAME);
    if (!paymentSheet || !registrationSheet) return { ok: false, error: 'required_sheet_missing' };
    var setup = _paymentEnsureAuditColumns(paymentSheet);
    var rows = _paymentReadRows(paymentSheet, setup.headers);
    var group = _paymentFindMessageGroup(rows, setup.index, payload.messageId);
    var duplicate = group.length > 0;

    if (duplicate) {
      if (!_paymentStoredGroupMatches(group, setup.index, payload.allocations)) {
        return { ok: false, error: 'duplicate_message_allocation_mismatch' };
      }
      var statuses = group.map(function (entry) { return entry.values[setup.index['Reconciliation Status']]; });
      if (statuses.every(function (status) { return status === 'approved'; })) {
        return {
          ok: true,
          duplicate: true,
          recovered: false,
          sheetRows: group.map(function (entry) { return entry.rowNumber; }),
          paymentStatuses: [],
        };
      }
    } else {
      var boundary = _paymentCandidateBoundary(payload.messageId);
      if (!boundary.ok) return boundary;
      var registration = _paymentRegistrationContext(registrationSheet);
      var reconciledAt = new Date().toISOString();
      var newRows = _paymentBuildAllocationRows(payload, setup, registration, reconciledAt);
      var startRow = paymentSheet.getLastRow() + 1;
      try {
        paymentSheet.getRange(startRow, 1, newRows.length, setup.headers.length).setValues(newRows);
        _paymentCopyNewRowFormulas(paymentSheet, setup, startRow, newRows.length);
      } catch (writeError) {
        return { ok: false, error: 'spreadsheet_write_failed' };
      }
      group = newRows.map(function (row, offset) { return { rowNumber: startRow + offset, values: row }; });
    }

    var affectedRefs = payload.allocations.map(function (allocation) { return allocation.refCode; });
    var paymentStatuses = _paymentUpdateRegistrationStatuses(
      paymentSheet, setup, registrationSheet, affectedRefs, payload.messageId
    );
    var labeled = _paymentApplyLabel(payload.messageId);
    if (!labeled.ok) {
      return {
        ok: false,
        error: labeled.error || 'gmail_label_failed',
        labelPending: true,
        sheetRows: group.map(function (entry) { return entry.rowNumber; }),
        paymentStatuses: paymentStatuses,
      };
    }
    _paymentSetGroupStatus(paymentSheet, setup, group, 'approved');
    return {
      ok: true,
      duplicate: duplicate,
      recovered: duplicate,
      sheetRows: group.map(function (entry) { return entry.rowNumber; }),
      paymentStatuses: paymentStatuses,
      gmail: { messageId: payload.messageId, label: 'kinfusion-etransfer' },
    };
  } catch (error) {
    return { ok: false, error: 'spreadsheet_write_failed' };
  } finally {
    lock.releaseLock();
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.setupPaymentReconciliationSheet = setupPaymentReconciliationSheet;
  globalThis.approvePaymentReconciliation = approvePaymentReconciliation;
  globalThis._paymentHasPendingMessage = _paymentHasPendingMessage;
}
