import { test, expect, describe } from 'bun:test';
import { generateTempPassword } from './temp-password.util';

describe('generateTempPassword', () => {
  test('respects the requested length (default 16)', () => {
    expect(generateTempPassword()).toHaveLength(16);
    expect(generateTempPassword(24)).toHaveLength(24);
  });

  test('always contains an upper, lower, digit and symbol', () => {
    for (let i = 0; i < 200; i++) {
      const p = generateTempPassword();
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[0-9]/);
      expect(p).toMatch(/[!@#$%*?\-_]/);
    }
  });

  test('excludes ambiguous characters (I, l, 1, O, 0)', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateTempPassword()).not.toMatch(/[Il1O0]/);
    }
  });

  test('is effectively unique across calls', () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateTempPassword()));
    expect(seen.size).toBe(500);
  });
});
