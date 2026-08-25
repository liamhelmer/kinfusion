/**
 * Shared helpers for all form handlers.
 * Available globally in Apps Script V8 after clasp push.
 */

// ADR R6.3: KF-XXXXX (5 alphanumeric [A-Z0-9] chars)
function generateRefCode_() {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  var code = 'KF-';
  for (var i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * @param {Object} data
 * @param {string} data.name
 * @param {string} data.refCode
 * @param {number} data.tier
 * @param {string} data.tierLabel
 * @param {string} data.accommodation
 * @param {string} data.accommodationLabel
 * @param {number} data.nights
 * @param {number} data.accommodationCost
 * @param {number} data.subtotal
 * @param {number} data.gst
 * @param {number} data.total
 */
function buildRegistrationEmailHtml_(data) {
  var template = HtmlService.createTemplateFromFile('register-confirmation');
  template.name = data.name || 'there';
  template.refCode = data.refCode || '';
  template.tier = data.tier || 0;
  template.tierLabel = data.tierLabel || '';
  template.accommodation = data.accommodation || 'camping';
  template.accommodationLabel = data.accommodationLabel || 'General camping';
  template.nights = data.nights || 0;
  template.accommodationCost = data.accommodationCost || 0;
  template.subtotal = data.subtotal || 0;
  template.gst = data.gst || 0;
  template.donation = data.donation || 0;
  template.total = data.total || 0;
  return template.evaluate().getContent();
}

function buildUnconferenceEmailHtml_(name, workshopTitle, refCode) {
  var template = HtmlService.createTemplateFromFile('unconference-confirmation');
  template.name = name || 'there';
  template.workshopTitle = workshopTitle || '';
  template.refCode = refCode;
  return template.evaluate().getContent();
}

function buildDJEmailHtml_(name, refCode) {
  var template = HtmlService.createTemplateFromFile('dj-confirmation');
  template.name = name || 'there';
  template.refCode = refCode;
  return template.evaluate().getContent();
}
