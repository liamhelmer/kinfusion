/**
 * DJ signup handler.
 * Lock is already held by gateway.js when this function is called.
 */
function handleDJSignup(payload) {
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty('SHEET_ID');
  var fromEmail = props.getProperty('FROM_EMAIL');

  if (!sheetId || !fromEmail) {
    return { ok: false, code: 'MISCONFIGURED' };
  }

  var refCode = generateRefCode();
  var timestamp = new Date().toISOString();

  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName('DJSignups');
  if (!sheet) {
    return { ok: false, code: 'SHEET_NOT_FOUND' };
  }

  sheet.appendRow([
    timestamp,
    refCode,
    payload.djName || '',
    payload.realName || '',
    payload.email || '',
    payload.setStyle || '',
    payload.setLengthMin || '',
    payload.preferredTime || '',
    payload.gearNeeded || '',
    payload.links || '',
    payload.notes || '',
    payload.experienceLevel || '',
  ]);

  var subject = 'Kin-Fusion Campout \u2014 DJ signup received (' + refCode + ')';
  var plainBody = [
    'Hi ' + (payload.djName || 'there') + ',',
    '',
    'Your DJ signup for Kin-Fusion Campout 2026 has been received.',
    '',
    'Reference: ' + refCode,
    '',
    'Organizers will be in touch about the schedule and logistics.',
    '',
    'Questions? Reply to this email or contact hello@kinfusion.dance',
    '',
    'Kin-Fusion Campout Team',
  ].join('\n');

  try {
    MailApp.sendEmail(payload.email, subject, plainBody, {
      from: fromEmail,
      replyTo: 'hello@kinfusion.dance',
      htmlBody: buildDJEmailHtml(payload.djName, refCode),
      name: 'Kin-Fusion Campout',
    });
  } catch (mailErr) {
    Logger.log('DJ email failed (auth not yet granted?): ' + mailErr.message);
  }

  Logger.log('DJ signup: ' + refCode);
  return { ok: true, refCode: refCode };
}
