/**
 * Registration form handler.
 * ADR R6.4: from = organizer Gmail, replyTo = hello@kinfusion.dance, subject contains refCode.
 * ADR R7.2: 21-column row schema for Registrations tab.
 * Lock is already held by gateway.js when this function is called.
 */

var ARRIVAL_DAY_NUMS = { thursday: 0, friday: 1, saturday: 2 };
var LEAVING_DAY_NUMS  = { sunday: 3, monday: 4 };
var ACCOMMODATION_RATES = {
  camping: 0, 'kdol-single': 75, 'kdol-double': 95, 'preset-tent': 65, 'geodesic-dome': 120, rv: 0
};
var ACCOMMODATION_LABELS = {
  camping: 'General camping',
  'kdol-single': 'KDOL cabin \u2014 single',
  'kdol-double': 'KDOL cabin \u2014 two people',
  'preset-tent': 'Pre-set tent (on-site)',
  'geodesic-dome': 'Geodesic dome',
  rv: 'RV',
};
var TIER_LABELS = { 300: 'Community/solidarity rate', 350: 'Standard rate', 400: 'Sustainer rate' };

function calcRegistrationPricing(payload) {
  var tier = parseInt(payload.tier) || 350;
  var accommodation = payload.accommodation || 'camping';
  var arrivalNum = ARRIVAL_DAY_NUMS[payload.arrivalDay] !== undefined ? ARRIVAL_DAY_NUMS[payload.arrivalDay] : 1;
  var leavingNum  = LEAVING_DAY_NUMS[payload.leavingDay]  !== undefined ? LEAVING_DAY_NUMS[payload.leavingDay]  : 3;
  var nights = leavingNum - arrivalNum;
  var rate = ACCOMMODATION_RATES[accommodation] || 0;
  var accommodationCost = rate * nights;
  var subtotalCents = (tier + accommodationCost) * 100;
  var gstCents = Math.round(subtotalCents * 0.05);
  var donation = parseFloat(payload.donation) || 0;
  return {
    tier: tier,
    tierLabel: TIER_LABELS[tier] || ('$' + tier),
    accommodation: accommodation,
    accommodationLabel: ACCOMMODATION_LABELS[accommodation] || accommodation,
    nights: nights,
    accommodationCost: accommodationCost,
    subtotal: (tier + accommodationCost),
    gst: gstCents / 100,
    donation: donation,
    total: (subtotalCents + gstCents) / 100 + donation,
  };
}

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
  var pricing = calcRegistrationPricing(payload);
  var children = Array.isArray(payload.children) ? payload.children : [];

  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName('Registrations');
  if (!sheet) {
    return { ok: false, code: 'SHEET_NOT_FOUND' };
  }

  // Column order: 22 original + col 23 (Donation) + col 24 (RVLength)
  sheet.appendRow([
    timestamp,
    refCode,
    payload.fullName || '',
    payload.email || '',
    payload.pronouns || '',
    pricing.tier,
    payload.scholarshipRequest === true || payload.scholarshipRequest === 'true',
    payload.scholarshipNote || '',
    payload.worktrade === true || payload.worktrade === 'true',
    payload.arrivalDay || '',
    payload.leavingDay || '',
    pricing.accommodation,
    children.length,
    payload.parentPhone || '',
    payload.dietaryNotes || '',
    payload.accessibilityNotes || '',
    payload.howDidYouHear || '',
    payload.photoConsent === true || payload.photoConsent === 'true',
    payload.codeOfConductAccepted === true || payload.codeOfConductAccepted === 'true',
    'pending-review',
    'unpaid',
    '',
    pricing.donation || 0,
    pricing.accommodation === 'rv' ? (parseInt(payload.rvLength) || 25) : ''
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
  var accLine = pricing.accommodationCost > 0
    ? pricing.accommodationLabel + ' x' + pricing.nights + ' nights: CAD $' + pricing.accommodationCost.toFixed(2) + '\n'
    : '';
  var plainBody = [
    'Hi ' + (payload.fullName || 'there') + ',',
    '',
    'Your application for Kin-Fusion Campout 2026 has been received.',
    'Reference code: ' + refCode,
    '',
    'IMPORTANT: This is an application, not a confirmed spot.',
    'Please wait for an acceptance email before sending payment.',
    '',
    '--- PAYMENT SUMMARY ---',
    'Registration (' + pricing.tierLabel + '): CAD $' + pricing.tier.toFixed(2),
    accLine + 'GST (5%): CAD $' + pricing.gst.toFixed(2),
    (pricing.donation > 0 ? 'Donation (no GST): CAD $' + pricing.donation.toFixed(2) + '\n' : '') + 'Total: CAD $' + pricing.total.toFixed(2),
    '',
    '--- HOW TO PAY ---',
    'Canadian (Interac e-Transfer):',
    '  Send to: info@rhizomesprings.com',
    '  Password: RHIZOME',
    '  Amount: CAD $' + pricing.total.toFixed(2),
    '',
    'US/International (Wise):',
    '  wise.com/pay/me/selenal40',
    '',
    'Include your reference code ' + refCode + ' in the message.',
    '',
    '--- WHAT\'S INCLUDED ---',
    pricing.accommodationLabel,
    '3 meals/day (breakfast, lunch, dinner) on Friday, Saturday, Sunday',
    'No meals on Thursday or Monday',
    'Nightly dances',
    '',
    'Practical info (directions, what to bring): kinfusion.dance/site-info/',
    '',
    'Questions? Reply to this email or contact hello@kinfusion.dance',
    '',
    'Kin-Fusion Campout Team',
  ].join('\n');

  var emailData = {
    name: payload.fullName,
    refCode: refCode,
    tier: pricing.tier,
    tierLabel: pricing.tierLabel,
    accommodation: pricing.accommodation,
    accommodationLabel: pricing.accommodationLabel,
    nights: pricing.nights,
    accommodationCost: pricing.accommodationCost,
    subtotal: pricing.subtotal,
    gst: pricing.gst,
    donation: pricing.donation,
    total: pricing.total,
  };

  try {
    MailApp.sendEmail(payload.email, subject, plainBody, {
      from: fromEmail,
      replyTo: 'hello@kinfusion.dance',
      htmlBody: buildRegistrationEmailHtml(emailData),
      name: 'Kin-Fusion Campout',
    });
  } catch (mailErr) {
    Logger.log('Registration email failed (auth not yet granted?): ' + mailErr.message);
  }

  Logger.log('Registration: ' + refCode + ' for ' + payload.email);
  return { ok: true, refCode: refCode };
}
