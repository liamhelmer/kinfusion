/**
 * Registration form handler.
 * ADR R6.4: from = organizer Gmail, replyTo = hello@kinfusion.dance, subject contains refCode.
 * ADR R7.2: 20-column row schema for Registrations tab.
 * Lock is already held by gateway.js when this function is called.
 */
function handleRegister(payload) {
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty('SHEET_ID');
  var fromEmail = props.getProperty('FROM_EMAIL');

  if (!sheetId || !fromEmail) {
    Logger.log('handleRegister: missing SHEET_ID or FROM_EMAIL');
    return { ok: false, code: 'MISCONFIGURED' };
  }

  var refCode = generateRefCode();
  var timestamp = new Date().toISOString();

  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName('Registrations');
  if (!sheet) {
    return { ok: false, code: 'SHEET_NOT_FOUND' };
  }

  var children = Array.isArray(payload.children) ? payload.children : [];

  // ADR R7.2 column order (20 columns)
  sheet.appendRow([
    timestamp,
    refCode,
    payload.fullName || '',
    payload.email || '',
    payload.pronouns || '',
    payload.tier || '',
    payload.scholarshipRequest === true || payload.scholarshipRequest === 'true',
    payload.scholarshipNote || '',
    payload.arrivalDay || '',
    payload.leavingDay || '',
    children.length,
    payload.parentPhone || '',
    payload.dietaryNotes || '',
    payload.accessibilityNotes || '',
    payload.howDidYouHear || '',
    payload.photoConsent === true || payload.photoConsent === 'true',
    payload.codeOfConductAccepted === true || payload.codeOfConductAccepted === 'true',
    'pending-review',
    'unpaid',
    ''
  ]);

  // Write each child to the Children tab
  if (children.length > 0) {
    var childSheet = ss.getSheetByName('Children');
    if (!childSheet) {
      childSheet = ss.insertSheet('Children');
      childSheet.appendRow(['Timestamp', 'ParentRefCode', 'ParentName', 'ParentEmail', 'ParentPhone', 'ChildName', 'ChildAge']);
    }
    for (var i = 0; i < children.length; i++) {
      childSheet.appendRow([
        timestamp,
        refCode,
        payload.fullName || '',
        payload.email || '',
        payload.parentPhone || '',
        children[i].name || '',
        children[i].age !== undefined ? children[i].age : ''
      ]);
    }
  }

  // Confirmation email (ADR R6.4)
  var subject = 'Kin-Fusion Campout \u2014 application received (' + refCode + ')';
  var plainBody = [
    'Hi ' + (payload.fullName || 'there') + ',',
    '',
    'Your application for Kin-Fusion Campout 2026 has been received.',
    '',
    'Your reference code is: ' + refCode,
    '',
    'IMPORTANT: This is an application, not a confirmation of your place.',
    'Organizers will review applications and reach out with acceptance and',
    'payment instructions (Interac e-transfer or Wyse).',
    '',
    'Questions? Reply to this email or contact hello@kinfusion.dance',
    '',
    'Kin-Fusion Campout Team',
  ].join('\n');

  var htmlBody = buildRegistrationEmailHtml(payload.fullName, refCode);

  MailApp.sendEmail(payload.email, subject, plainBody, {
    from: fromEmail,
    replyTo: 'hello@kinfusion.dance',
    htmlBody: htmlBody,
    name: 'Kin-Fusion Campout',
  });

  Logger.log('Registration: ' + refCode + ' for ' + payload.email);
  return { ok: true, refCode: refCode };
}
