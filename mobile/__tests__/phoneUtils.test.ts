import {
  normalizePhoneNumber,
  isValidPhoneNumber,
  getPhoneNumberVariants,
  getPrefixVariants,
} from '../src/utils/phoneUtils';

describe('phoneUtils', () => {
  describe('normalizePhoneNumber', () => {
    it('normalizes 11-digit Nigerian local numbers to E.164', () => {
      expect(normalizePhoneNumber('08162051907')).toBe('+2348162051907');
      expect(normalizePhoneNumber('0803 123 4567')).toBe('+2348031234567');
    });

    it('normalizes 13-digit Nigerian numbers without plus', () => {
      expect(normalizePhoneNumber('2348162051907')).toBe('+2348162051907');
    });

    it('preserves valid E.164 numbers and strips formatting characters', () => {
      expect(normalizePhoneNumber('+1 (415) 555-2671')).toBe('+14155552671');
      expect(normalizePhoneNumber('+44 20 7123 1001')).toBe('+442071231001');
    });

    it('returns empty string for blank input', () => {
      expect(normalizePhoneNumber('   ')).toBe('');
    });
  });

  describe('isValidPhoneNumber', () => {
    it('returns true for valid local and international numbers', () => {
      expect(isValidPhoneNumber('08162051907')).toBe(true);
      expect(isValidPhoneNumber('+14155552671')).toBe(true);
      expect(isValidPhoneNumber('+2348162051907')).toBe(true);
    });

    it('returns false for short or invalid inputs', () => {
      expect(isValidPhoneNumber('123')).toBe(false);
      expect(isValidPhoneNumber('abc-def')).toBe(false);
      expect(isValidPhoneNumber('')).toBe(false);
    });
  });

  describe('getPhoneNumberVariants', () => {
    it('generates E.164, non-plus, and local 0-prefixed variants for Nigerian numbers', () => {
      const variants = getPhoneNumberVariants('08162051907');
      expect(variants).toEqual(
        expect.arrayContaining(['08162051907', '+2348162051907', '2348162051907']),
      );
    });
  });

  describe('getPrefixVariants', () => {
    it('generates all prefix forms and strips wildcard characters', () => {
      const variants = getPrefixVariants('0201888*');
      expect(variants).toEqual(
        expect.arrayContaining(['0201888', '+234201888', '234201888']),
      );
    });
  });
});
