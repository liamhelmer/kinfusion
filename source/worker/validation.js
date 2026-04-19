// ADR R7.3: server-side max-length and type validation for all three forms.

const VALID_TIERS = new Set(['300', '350', '400']);
const VALID_ARRIVAL_DAYS = new Set(['thursday', 'friday', 'saturday']);
const VALID_LEAVING_DAYS = new Set(['sunday', 'monday']);
const VALID_DURATIONS = new Set(['30', '60', '90']);
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
    VALID_ARRIVAL_DAYS.has(String(body.arrivalDay)) ? null : { valid: false, field: 'arrivalDay', code: 'VALIDATION' },
    checkRequired(body.leavingDay, 'leavingDay'),
    VALID_LEAVING_DAYS.has(String(body.leavingDay)) ? null : { valid: false, field: 'leavingDay', code: 'VALIDATION' },
    body.codeOfConductAccepted === true ? null : { valid: false, field: 'codeOfConductAccepted', code: 'VALIDATION' },
    checkLength(body.pronouns, 100, 'pronouns'),
    checkLength(body.scholarshipNote, 500, 'scholarshipNote'),
    checkLength(body.dietaryNotes, 500, 'dietaryNotes'),
    checkLength(body.accessibilityNotes, 500, 'accessibilityNotes'),
    checkLength(body.howDidYouHear, 200, 'howDidYouHear'),
    checkLength(body.parentPhone, 50, 'parentPhone'),
  ];
  for (const result of checks) {
    if (result) return result;
  }

  // Children validation
  const children = body.children;
  if (children !== undefined) {
    if (!Array.isArray(children) || children.length > 10) {
      return { valid: false, field: 'children', code: 'VALIDATION' };
    }
    for (const child of children) {
      if (!child || typeof child.name !== 'string' || child.name.length === 0 || child.name.length > 100) {
        return { valid: false, field: 'children', code: 'VALIDATION' };
      }
      if (typeof child.age !== 'number' || child.age < 0 || child.age > 12) {
        return { valid: false, field: 'children', code: 'VALIDATION' };
      }
    }
    if (children.length > 0) {
      const phoneCheck = checkRequired(body.parentPhone, 'parentPhone');
      if (phoneCheck) return phoneCheck;
    }
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
    VALID_DURATIONS.has(String(body.duration)) ? null : { valid: false, field: 'duration', code: 'VALIDATION' },
    checkLength(body.notes, 500, 'notes'),
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
    checkLength(body.realName, 100, 'realName'),
    checkRequired(body.email, 'email'),
    EMAIL_REGEX.test(String(body.email || '')) ? null : { valid: false, field: 'email', code: 'VALIDATION' },
    checkRequired(body.setStyle, 'setStyle'),
    checkLength(body.setStyle, 200, 'setStyle'),
    checkRequired(body.setLengthMin, 'setLengthMin'),
    checkLength(body.preferredTime, 200, 'preferredTime'),
    checkLength(body.gearNeeded, 500, 'gearNeeded'),
    checkLength(body.notes, 500, 'notes'),
    checkLength(body.links, 500, 'links'),
  ];
  for (const result of checks) {
    if (result) return result;
  }
  const setLen = parseInt(body.setLengthMin, 10);
  if (isNaN(setLen) || setLen < 15 || setLen > 240) {
    return { valid: false, field: 'setLengthMin', code: 'VALIDATION' };
  }
  return { valid: true };
}
