import { test, expect, describe } from 'bun:test';
import { numberToFrenchWords, amountInWords } from './amount-in-words';

describe('numberToFrenchWords', () => {
  const cases: Array<[number, string]> = [
    [0, 'zéro'],
    [1, 'un'],
    [15, 'quinze'],
    [20, 'vingt'],
    [21, 'vingt et un'],
    [34, 'trente-quatre'],
    [70, 'soixante-dix'],
    [71, 'soixante et onze'],
    [79, 'soixante-dix-neuf'],
    [80, 'quatre-vingts'],
    [81, 'quatre-vingt-un'],
    [90, 'quatre-vingt-dix'],
    [91, 'quatre-vingt-onze'],
    [99, 'quatre-vingt-dix-neuf'],
    [100, 'cent'],
    [101, 'cent un'],
    [199, 'cent quatre-vingt-dix-neuf'],
    [200, 'deux cents'],
    [201, 'deux cent un'],
    [280, 'deux cent quatre-vingts'],
    [999, 'neuf cent quatre-vingt-dix-neuf'],
    [1_000, 'mille'],
    [1_001, 'mille un'],
    [2_000, 'deux mille'],
    [21_000, 'vingt et un mille'],
    [80_000, 'quatre-vingt mille'], // "vingts" drops its s before "mille"
    [200_000, 'deux cent mille'], // "cents" drops its s before "mille"
    [100_000, 'cent mille'],
    [1_000_000, 'un million'],
    [2_000_000, 'deux millions'],
    [1_234_567, 'un million deux cent trente-quatre mille cinq cent soixante-sept'],
  ];

  for (const [input, expected] of cases) {
    test(`${input} -> "${expected}"`, () => {
      expect(numberToFrenchWords(input)).toBe(expected);
    });
  }

  test('rejects negative numbers', () => {
    expect(() => numberToFrenchWords(-1)).toThrow();
  });

  test('rejects non-integers', () => {
    expect(() => numberToFrenchWords(1.5)).toThrow();
  });
});

describe('amountInWords', () => {
  test('capitalizes the first letter and appends the currency name', () => {
    expect(amountInWords(1_150, 'USD')).toBe('Mille cent cinquante dollars américains');
  });

  test('falls back to the raw currency code for an unknown currency', () => {
    expect(amountInWords(10, 'XYZ')).toBe('Dix XYZ');
  });

  test('CDF and CAD map to their French currency names', () => {
    expect(amountInWords(500, 'CDF')).toBe('Cinq cents francs congolais');
    expect(amountInWords(500, 'CAD')).toBe('Cinq cents dollars canadiens');
  });
});
