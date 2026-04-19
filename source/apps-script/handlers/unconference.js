/**
 * Unconference proposal handler.
 * Lock is already held by gateway.js when this function is called.
 */
function handleUnconference(payload) {
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty('SHEET_ID');
  var fromEmail = props.getProperty('FROM_EMAIL');

  if (!sheetId || !fromEmail) {
    return { ok: false, code: 'MISCONFIGURED' };
  }

  var refCode = generateRefCode();
  var timestamp = new Date().toISOString();

  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName('UnconferenceProposals');
  if (!sheet) {
    return { ok: false, code: 'SHEET_NOT_FOUND' };
  }

  sheet.appendRow([
    timestamp,
    refCode,
    payload.proposerName || '',
    payload.email || '',
    payload.workshopTitle || '',
    payload.description || '',
    payload.duration || '',
    payload.materialsNeeded || '',
    payload.preferredDay || '',
  ]);

  var subject = 'Kin-Fusion Campout \u2014 workshop proposal received (' + refCode + ')';
  var plainBody = [
    'Hi ' + (payload.proposerName || 'there') + ',',
    '',
    'Your unconference workshop proposal has been received.',
    '',
    'Workshop: ' + (payload.workshopTitle || ''),
    'Reference: ' + refCode,
    '',
    'Organizers will review proposals and be in touch about the schedule.',
    '',
    'Questions? Reply to this email or contact hello@kinfusion.dance',
    '',
    'Kin-Fusion Campout Team',
  ].join('\n');

  MailApp.sendEmail(payload.email, subject, plainBody, {
    from: fromEmail,
    replyTo: 'hello@kinfusion.dance',
    htmlBody: buildUnconferenceEmailHtml(payload.proposerName, payload.workshopTitle, refCode),
    name: 'Kin-Fusion Campout',
  });

  Logger.log('Unconference proposal: ' + refCode);
  return { ok: true, refCode: refCode };
}
