import { detectCarrier, isLagosVoip, timeAgo } from '../src/utils/carrier';

describe('carrier utilities', () => {
  describe('isLagosVoip', () => {
    it('identifies 0201 and +234201 prefixes as Lagos VoIP', () => {
      expect(isLagosVoip('02018881234')).toBe(true);
      expect(isLagosVoip('+2342018881234')).toBe(true);
      expect(isLagosVoip('08031234567')).toBe(false);
    });
  });

  describe('detectCarrier', () => {
    it('detects Nigerian mobile carriers accurately', () => {
      expect(detectCarrier('08031234567')).toBe('MTN Nigeria');
      expect(detectCarrier('+2348021234567')).toBe('Airtel Nigeria');
      expect(detectCarrier('08051234567')).toBe('Glo Nigeria');
      expect(detectCarrier('08091234567')).toBe('9mobile');
    });

    it('detects Lagos VoIP and international prefixes', () => {
      expect(detectCarrier('+2342015550199')).toBe('Lagos VoIP');
      expect(detectCarrier('+442071231001')).toBe('UK International');
      expect(detectCarrier('+14155552671')).toBe('US/CA International');
      expect(detectCarrier('+4930901820001')).toBe('International');
    });
  });

  describe('timeAgo', () => {
    it('formats recent and past timestamps', () => {
      const now = new Date().toISOString();
      expect(timeAgo(now)).toBe('Just now');

      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      expect(timeAgo(fiveMinsAgo)).toBe('5m ago');

      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      expect(timeAgo(twoHoursAgo)).toBe('2h ago');
    });
  });
});
