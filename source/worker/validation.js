// ADR R7.3: server-side max-length and type validation for all three forms.

const VALID_TIERS = new Set(['300', '350', '400']);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkLength(value, max, field) {
  if (value !== undefined && value !== null && String(value).length > max) {
    return { valid: false, field, code: 'VALIDATION' };
  }
  return null;
}

function checkRequired(value, field) {
  if (value === undefined || value === null || value === '') {
    return { valid: false, field, code: 'VALIDATION' };
  }
  return null;
}

export function validateRegistration(body) {
  const checks = [
    checkRequired(body.fullName, 'fullName'),
    checkLength(body.fullName, 100, 'fullName'),
    checkRequired(body.email, 'email'),
    EMAIL_REGEX.test(String(body.email || '')) ? null : { valid: false, field: 'email', code: 'VALIDATION' },
    checkRequired(body.tier, 'tier'),
    VALID_TIERS.has(String(body.tier)) ? null : { valid: false, field: 'tier', code: 'VALIDATION' },
    checkRequired(body.arrivalDay, 'arrivalDay'),
    body.codeOfConductAccepted === true ? null : { valid: false, field: 'codeOfConductAccepted', code: 'VALIDATION' },
    checkLength(body.pronouns, 100, 'pronouns'),
    checkLength(body.scholarshipNote, 500, 'scholarshipNote'),
    checkLength(body.dietaryNotes, 500, 'dietaryNotes'),
    checkLength(body.accessibilityNotes, 500, 'accessibilityNotes'),
    checkLength(body.howDidYouHear, 200, 'howDidYouHear'),
  ];
  for (const result of checks) {
    if (result) return result;
  }
  const kidsUnder13 = parseInt(body.kidsUnder13 || 0, 10);
  const kids13AndOver = parseInt(body.kids13AndOver || 0, 10);
  if (isNaN(kidsUnder13) || kidsUnder13 < 0 || kidsUnder13 > 5) {
    return { valid: false, field: 'kidsUnder13', code: 'VALIDATION' };
  }
  if (isNaN(kids13AndOver) || kids13AndOver < 0 || kids13AndOver > 5) {
    return { valid: false, field: 'kids13AndOver', code: 'VALIDATION' };
  }
  return { valid: true };
}

export function validateUnconference(body) {
  const checks = [
    checkRequired(body.proposerName, 'proposerName'),
    checkLength(body.proposerName, 100, 'proposerName'),
    checkRequired(body.email, 'email'),
    EMAIL_REGEX.test(String(body.email || '')) ? null : { valid: false, field: 'email', code: 'VALIDATION' },
    checkRequired(body.workshopTitle, 'workshopTitle'),
    checkLength(body.workshopTitle, 200, 'workshopTitle'),
    checkRequired(body.description, 'description'),
    checkLength(body.description, 500, 'description'),
    checkRequired(body.duration, 'duration'),
    checkLength(body.materialsNeeded, 200, 'materialsNeeded'),
  ];
  for (const result of checks) {
    if (result) return result;
  }
  return { valid: true };
}

export function validateDJ(body) {
  const checks = [
    checkRequired(body.djName, 'djName'),
    checkLength(body.djName, 100, 'djName'),
    checkRequired(body.realName, 'realName'),
    checkLength(body.realName, 100, 'realName'),
    checkRequired(body.email, 'email'),
    EMAIL_REGEX.test(String(body.email || '')) ? null : { valid: false, field: 'email', code: 'VALIDATION' },
    checkRequired(body.setStyle, 'setStyle'),
    checkLength(body.setStyle, 200, 'setStyle'),
    checkRequired(body.setLengthMin, 'setLengthMin'),
    checkLength(body.gearNeeded, 200, 'gearNeeded'),
    checkLength(body.links, 500, 'links'),
  ];
  for (const result of checks) {
    if (result) return result;
  }
  return { valid: true };
}
