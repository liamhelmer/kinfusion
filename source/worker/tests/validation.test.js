import { describe, it, expect } from 'vitest';
import { validateRegistration, validateUnconference, validateDJ } from '../validation.js';

const validReg = {
  fullName: 'Test Person',
  email: 'test@example.com',
  tier: '350',
  arrivalDay: 'friday',
  leavingDay: 'sunday',
  codeOfConductAccepted: true,
};

describe('validateRegistration', () => {
  it('accepts a valid registration payload', () => {
    expect(validateRegistration(validReg)).toEqual({ valid: true });
  });

  it('rejects dietaryNotes > 500 chars', () => {
    const r = validateRegistration({ ...validReg, dietaryNotes: 'x'.repeat(501) });
    expect(r.valid).toBe(false);
    expect(r.field).toBe('dietaryNotes');
    expect(r.code).toBe('VALIDATION');
  });

  it('rejects invalid tier', () => {
    const r = validateRegistration({ ...validReg, tier: '500' });
    expect(r.valid).toBe(false);
    expect(r.field).toBe('tier');
  });

  it('rejects codeOfConductAccepted: false', () => {
    const r = validateRegistration({ ...validReg, codeOfConductAccepted: false });
    expect(r.valid).toBe(false);
    expect(r.field).toBe('codeOfConductAccepted');
  });

  it('rejects malformed email', () => {
    const r = validateRegistration({ ...validReg, email: 'not-an-email' });
    expect(r.valid).toBe(false);
    expect(r.field).toBe('email');
  });

  it('rejects fullName > 100 chars', () => {
    const r = validateRegistration({ ...validReg, fullName: 'a'.repeat(101) });
    expect(r.valid).toBe(false);
    expect(r.field).toBe('fullName');
  });

  it('rejects howDidYouHear > 200 chars', () => {
    const r = validateRegistration({ ...validReg, howDidYouHear: 'y'.repeat(201) });
    expect(r.valid).toBe(false);
    expect(r.field).toBe('howDidYouHear');
  });
});

const validUncof = {
  proposerName: 'Facilitator',
  email: 'fac@example.com',
  workshopTitle: 'My Workshop',
  description: 'About the workshop',
  duration: '60',
};

describe('validateUnconference', () => {
  it('accepts a valid unconference payload', () => {
    expect(validateUnconference(validUncof)).toEqual({ valid: true });
  });

  it('rejects description > 500 chars', () => {
    const r = validateUnconference({ ...validUncof, description: 'x'.repeat(501) });
    expect(r.valid).toBe(false);
    expect(r.field).toBe('description');
  });
});

const validDJ = {
  djName: 'DJ Groove',
  realName: 'Real Name',
  email: 'dj@example.com',
  setStyle: 'Deep house',
  experienceLevel: 'local-events',
};

describe('validateDJ', () => {
  it('accepts a valid DJ payload', () => {
    expect(validateDJ(validDJ)).toEqual({ valid: true });
  });

  it('rejects links > 500 chars', () => {
    const r = validateDJ({ ...validDJ, links: 'x'.repeat(501) });
    expect(r.valid).toBe(false);
    expect(r.field).toBe('links');
  });
});
