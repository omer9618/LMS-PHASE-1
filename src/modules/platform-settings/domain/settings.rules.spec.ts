import {
  InvalidSettingValueError,
  normaliseSettingValue,
  readSetting,
  UnknownSettingError,
} from './settings.rules';

describe('platform settings rules', () => {
  it('parses stored strings into typed values', () => {
    expect(readSetting('ORDER_EXPIRY_WINDOW_HOURS', '72')).toBe(72);
  });

  it('falls back to the default when missing or no longer valid', () => {
    expect(readSetting('VIDEO_COMPLETION_THRESHOLD_PCT', undefined)).toBe(90);
    expect(readSetting('VIDEO_COMPLETION_THRESHOLD_PCT', 'garbage')).toBe(90);
    expect(readSetting('VIDEO_COMPLETION_THRESHOLD_PCT', '10')).toBe(90);
  });

  it('normalises valid admin input to the stored string', () => {
    expect(normaliseSettingValue('PAYOUT_DISPUTE_WINDOW_DAYS', 10)).toEqual({
      key: 'PAYOUT_DISPUTE_WINDOW_DAYS',
      stored: '10',
    });
    expect(normaliseSettingValue('PAYOUT_DISPUTE_WINDOW_DAYS', '14').stored).toBe('14');
  });

  it('rejects unknown keys and out-of-range or non-integer values', () => {
    expect(() => normaliseSettingValue('NOT_A_SETTING', 1)).toThrow(UnknownSettingError);
    expect(() => normaliseSettingValue('ORDER_EXPIRY_WINDOW_HOURS', 0)).toThrow(
      InvalidSettingValueError,
    );
    expect(() => normaliseSettingValue('ORDER_EXPIRY_WINDOW_HOURS', 1.5)).toThrow(
      InvalidSettingValueError,
    );
    expect(() => normaliseSettingValue('VIDEO_COMPLETION_THRESHOLD_PCT', 101)).toThrow(
      InvalidSettingValueError,
    );
  });
});
