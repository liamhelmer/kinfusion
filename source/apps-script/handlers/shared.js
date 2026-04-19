/**
 * Shared helpers for all form handlers.
 * Available globally in Apps Script V8 after clasp push.
 */

// ADR R6.3: KF-XXXXX (5 alphanumeric [A-Z0-9] chars)
function generateRefCode() {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  var code = 'KF-';
  for (var i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function buildRegistrationEmailHtml(name, refCode) {
  var template = HtmlService.createTemplateFromFile('templates/register-confirmation');
  template.name = name || 'there';
  template.refCode = refCode;
  return template.evaluate().getContent();
}

function buildUnconferenceEmailHtml(name, workshopTitle, refCode) {
  var template = HtmlService.createTemplateFromFile('templates/unconference-confirmation');
  template.name = name || 'there';
  template.workshopTitle = workshopTitle || '';
  template.refCode = refCode;
  return template.evaluate().getContent();
}

function buildDJEmailHtml(name, refCode) {
  var template = HtmlService.createTemplateFromFile('templates/dj-confirmation');
  template.name = name || 'there';
  template.refCode = refCode;
  return template.evaluate().getContent();
}
