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

function paymentOpenSpreadsheet_() {
  var sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!sheetId) throw new Error('missing_sheet_id');
  return SpreadsheetApp.openById(sheetId);
}

function paymentHeaders_(sheet) {
  var columns = sheet.getLastColumn();
  return columns ? sheet.getRange(1, 1, 1, columns).getValues()[0] : [];
}

function paymentEnsureAuditColumns_(sheet) {
  var headers = paymentHeaders_(sheet);
  var index = paymentHeaderIndex_(headers);
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
    var ss = paymentOpenSpreadsheet_();
    var sheet = ss.getSheetByName(PAYMENT_SHEET_NAME);
    if (!sheet) return { ok: false, error: 'payment_sheet_missing' };
    var setup = paymentEnsureAuditColumns_(sheet);
    return { ok: true, addedHeaders: setup.addedHeaders, auditColumnStart: setup.auditColumnStart };
  } catch (error) {
    return { ok: false, error: 'spreadsheet_setup_failed', detail: String(error.message || error) };
  }
}

function paymentReadRows_(sheet, headers) {
  var count = Math.max(0, sheet.getLastRow() - 1);
  return count ? sheet.getRange(2, 1, count, headers.length).getValues() : [];
}

function paymentFindMessageGroup_(rows, index, messageId) {
  var result = [];
  var column = index['Gmail Message ID'];
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][column] || '') === messageId) result.push({ rowNumber: i + 2, values: rows[i] });
  }
  return result;
}

function paymentStoredGroupMatches_(group, index, allocations) {
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

function paymentRegistrationContext_(sheet) {
  var headers = paymentHeaders_(sheet);
  var index = paymentHeaderIndex_(headers);
  if (index.RefCode === undefined || index.PaymentStatus === undefined) {
    throw new Error('registration_headers_missing');
  }
  var rows = paymentReadRows_(sheet, headers);
  var byRef = {};
  rows.forEach(function (row, offset) {
    var refCode = String(row[index.RefCode] || '').trim().toUpperCase();
    if (refCode) byRef[refCode] = { rowNumber: offset + 2, values: row };
  });
  return { headers: headers, index: index, rows: rows, byRef: byRef };
}

function paymentBuildAllocationRows_(payload, paymentSetup, registration, reconciledAt) {
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

function paymentCopyNewRowFormulas_(sheet, setup, startRow, rowCount) {
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

function paymentRepairGroupFormulas_(sheet, setup, group) {
  var rowNumbers = group.map(function (entry) { return entry.rowNumber; }).sort(function (a, b) { return a - b; });
  var startRow = rowNumbers[0];
  for (var i = 1; i < rowNumbers.length; i++) {
    if (rowNumbers[i] !== startRow + i) throw new Error('message_group_not_contiguous');
  }
  paymentCopyNewRowFormulas_(sheet, setup, startRow, rowNumbers.length);
}

function paymentExpectedTotals_(rows, index) {
  var expected = {};
  rows.forEach(function (row) {
    var refCode = String(row[index.RefCode] || '').trim().toUpperCase();
    var paid = Number(row[index['Total paid']]);
    var unpaid = Number(row[index['Total unpaid']]);
    if (refCode && isFinite(paid) && isFinite(unpaid) && paid >= 0 && unpaid >= 0 && (paid + unpaid) > 0) {
      var total = Math.round((paid + unpaid) * 100);
      if (expected[refCode] === undefined) expected[refCode] = total;
      else if (expected[refCode] === null || Math.abs(expected[refCode] - total) > 1) expected[refCode] = null;
    }
  });
  return expected;
}

function paymentUpdateRegistrationStatuses_(paymentSheet, setup, registrationSheet, affectedRefs, currentMessageId) {
  SpreadsheetApp.flush();
  var rows = paymentReadRows_(paymentSheet, setup.headers);
  var paidTotals = {};
  var expectedTotals = paymentExpectedTotals_(rows, setup.index);
  rows.forEach(function (row) {
    var refCode = String(row[setup.index.RefCode] || '').trim().toUpperCase();
    var status = String(row[setup.index['Reconciliation Status']] || '');
    var messageId = String(row[setup.index['Gmail Message ID']] || '');
    var countable = !status || status === 'approved' || (status === 'label-pending' && messageId === currentMessageId);
    if (refCode && countable) {
      paidTotals[refCode] = (paidTotals[refCode] || 0) + Math.round(Number(row[setup.index["Amount rec'd"]] || 0) * 100);
    }
  });

  var registration = paymentRegistrationContext_(registrationSheet);
  var reports = [];
  affectedRefs.forEach(function (refCode) {
    var entry = registration.byRef[refCode];
    if (!entry) {
      reports.push({ refCode: refCode, status: 'unclear', skipped: 'registration_not_found' });
      return;
    }
    var status = paymentCompareBalance_(paidTotals[refCode] || 0, expectedTotals[refCode]);
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

function paymentSetGroupStatus_(paymentSheet, setup, group, status) {
  var column = setup.index['Reconciliation Status'] + 1;
  group.forEach(function (entry) {
    paymentSheet.getRange(entry.rowNumber, column).setValues([[status]]);
  });
}

function paymentHasPendingMessage_(messageId) {
  try {
    var ss = paymentOpenSpreadsheet_();
    var sheet = ss.getSheetByName(PAYMENT_SHEET_NAME);
    if (!sheet) return false;
    var setup = paymentEnsureAuditColumns_(sheet);
    return paymentFindMessageGroup_(paymentReadRows_(sheet, setup.headers), setup.index, String(messageId))
      .some(function (entry) { return entry.values[setup.index['Reconciliation Status']] === 'label-pending'; });
  } catch (error) {
    return false;
  }
}

function approvePaymentReconciliation(rawPayload) {
  var validation = paymentValidateAllocations_(rawPayload);
  if (!validation.ok) return validation;
  var payload = validation.value;
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = paymentOpenSpreadsheet_();
    var paymentSheet = ss.getSheetByName(PAYMENT_SHEET_NAME);
    var registrationSheet = ss.getSheetByName(PAYMENT_REGISTRATION_SHEET_NAME);
    if (!paymentSheet || !registrationSheet) return { ok: false, error: 'required_sheet_missing' };
    var setup = paymentEnsureAuditColumns_(paymentSheet);
    var rows = paymentReadRows_(paymentSheet, setup.headers);
    var group = paymentFindMessageGroup_(rows, setup.index, payload.messageId);
    var duplicate = group.length > 0;

    if (duplicate) {
      if (!paymentStoredGroupMatches_(group, setup.index, payload.allocations)) {
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
      try {
        paymentRepairGroupFormulas_(paymentSheet, setup, group);
      } catch (repairError) {
        return {
          ok: false,
          error: 'spreadsheet_write_failed',
          labelPending: true,
          sheetRows: group.map(function (entry) { return entry.rowNumber; }),
        };
      }
    } else {
      var boundary = paymentCandidateBoundary_(payload.messageId);
      if (!boundary.ok) return boundary;
      var registration = paymentRegistrationContext_(registrationSheet);
      var reconciledAt = new Date().toISOString();
      var newRows = paymentBuildAllocationRows_(payload, setup, registration, reconciledAt);
      var startRow = paymentSheet.getLastRow() + 1;
      var rowsWritten = false;
      try {
        paymentSheet.getRange(startRow, 1, newRows.length, setup.headers.length).setValues(newRows);
        rowsWritten = true;
        group = newRows.map(function (row, offset) { return { rowNumber: startRow + offset, values: row }; });
        paymentRepairGroupFormulas_(paymentSheet, setup, group);
      } catch (writeError) {
        var writeFailure = { ok: false, error: 'spreadsheet_write_failed' };
        if (rowsWritten) {
          writeFailure.labelPending = true;
          writeFailure.sheetRows = group.map(function (entry) { return entry.rowNumber; });
        }
        return writeFailure;
      }
    }

    var sheetRows = group.map(function (entry) { return entry.rowNumber; });
    var affectedRefs = payload.allocations.map(function (allocation) { return allocation.refCode; });
    var paymentStatuses = [];
    try {
      paymentStatuses = paymentUpdateRegistrationStatuses_(
        paymentSheet, setup, registrationSheet, affectedRefs, payload.messageId
      );
    } catch (statusError) {
      return {
        ok: false,
        error: 'spreadsheet_status_update_failed',
        labelPending: true,
        gmailLabeled: false,
        sheetRows: sheetRows,
        paymentStatuses: paymentStatuses,
      };
    }
    var labeled;
    try {
      labeled = paymentApplyLabel_(payload.messageId);
    } catch (labelError) {
      return {
        ok: false,
        error: 'gmail_label_failed',
        labelPending: true,
        gmailLabeled: false,
        sheetRows: sheetRows,
        paymentStatuses: paymentStatuses,
      };
    }
    if (!labeled.ok) {
      return {
        ok: false,
        error: labeled.error || 'gmail_label_failed',
        labelPending: true,
        gmailLabeled: false,
        sheetRows: sheetRows,
        paymentStatuses: paymentStatuses,
      };
    }
    try {
      paymentSetGroupStatus_(paymentSheet, setup, group, 'approved');
    } catch (finalizeError) {
      return {
        ok: false,
        error: 'spreadsheet_finalize_failed',
        labelPending: true,
        gmailLabeled: true,
        sheetRows: sheetRows,
        paymentStatuses: paymentStatuses,
        gmail: { messageId: payload.messageId, label: 'kinfusion-etransfer' },
      };
    }
    return {
      ok: true,
      duplicate: duplicate,
      recovered: duplicate,
      sheetRows: sheetRows,
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
  globalThis.paymentHasPendingMessage_ = paymentHasPendingMessage_;
}
