// ADR R7.3: server-side max-length and type validation for all three forms.

const VALID_TIERS = new Set(['300', '350', '400']);
const VALID_ARRIVAL_DAYS = new Set(['thursday', 'friday', 'saturday']);
const VALID_LEAVING_DAYS = new Set(['sunday', 'monday']);
const VALID_DURATIONS = new Set(['30', '60', '90']);
const VALID_ACCOMMODATIONS = new Set(['camping', 'kdol-single', 'kdol-double', 'preset-tent', 'geodesic-dome', 'rv']);
const VALID_DJ_EXPERIENCE = new Set(['none', 'house-parties', 'local-events', 'weekenders', 'travelled-weekenders']);
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
    body.accommodation ? (VALID_ACCOMMODATIONS.has(String(body.accommodation)) ? null : { valid: false, field: 'accommodation', code: 'VALIDATION' }) : null,
    body.codeOfConductAccepted === true ? null : { valid: false, field: 'codeOfConductAccepted', code: 'VALIDATION' },
    checkLength(body.pronouns, 100, 'pronouns'),
    checkLength(body.scholarshipNote, 500, 'scholarshipNote'),
    checkLength(body.dietaryNotes, 500, 'dietaryNotes'),
    checkLength(body.accessibilityNotes, 500, 'accessibilityNotes'),
    checkLength(body.howDidYouHear, 200, 'howDidYouHear'),
    checkLength(body.parentPhone, 50, 'parentPhone'),
    checkLength(body.adultAllergies, 500, 'adultAllergies'),
    checkLength(body.guardianNames, 300, 'guardianNames'),
  ];
  for (const result of checks) {
    if (result) return result;
  }

  // Donation validation (optional, 0–9999)
  if (body.donation !== undefined && body.donation !== null && body.donation !== '') {
    const donationVal = parseFloat(body.donation);
    if (isNaN(donationVal) || donationVal < 0 || donationVal > 9999) {
      return { valid: false, field: 'donation', code: 'VALIDATION' };
    }
  }

  // RV length validation (required when accommodation === 'rv')
  if (body.accommodation === 'rv') {
    if (body.rvLength === undefined || body.rvLength === null || body.rvLength === '') {
      return { valid: false, field: 'rvLength', code: 'VALIDATION' };
    }
    const rvLen = parseInt(body.rvLength, 10);
    if (isNaN(rvLen) || rvLen < 10 || rvLen > 100) {
      return { valid: false, field: 'rvLength', code: 'VALIDATION' };
    }
  }

  // Youth 13-18 validation: guardian names required if youth checkbox set
  if (body.isYouth13to18 === true || body.isYouth13to18 === 'true') {
    const guardianCheck = checkRequired(body.guardianNames, 'guardianNames');
    if (guardianCheck) return guardianCheck;
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
      if (child.relationship !== undefined && (typeof child.relationship !== 'string' || child.relationship.length > 100)) {
        return { valid: false, field: 'children', code: 'VALIDATION' };
      }
      if (child.dietary !== undefined && (typeof child.dietary !== 'string' || child.dietary.length > 500)) {
        return { valid: false, field: 'children', code: 'VALIDATION' };
      }
      if (child.alternateParents !== undefined && (typeof child.alternateParents !== 'string' || child.alternateParents.length > 300)) {
        return { valid: false, field: 'children', code: 'VALIDATION' };
      }
      if (child.allergies !== undefined && (typeof child.allergies !== 'string' || child.allergies.length > 500)) {
        return { valid: false, field: 'children', code: 'VALIDATION' };
      }
    }
    if (children.length > 0) {
      const phoneCheck = checkRequired(body.parentPhone, 'parentPhone');
      if (phoneCheck) return phoneCheck;
      // Kids agreements acceptance required when bringing children
      if (body.kidsAgreementsAccepted !== true && body.kidsAgreementsAccepted !== 'true') {
        return { valid: false, field: 'kidsAgreementsAccepted', code: 'VALIDATION' };
      }
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
    checkRequired(body.experienceLevel, 'experienceLevel'),
    VALID_DJ_EXPERIENCE.has(String(body.experienceLevel || '')) ? null : { valid: false, field: 'experienceLevel', code: 'VALIDATION' },
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
