const UNITS = [
  'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf',
];
const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

/** 0-99. Handles the irregular 70-79 (soixante-dix…) and 80-99 (quatre-vingt…) ranges. */
function twoDigits(n: number): string {
  if (n < 20) return UNITS[n];
  if (n < 70) {
    const tens = Math.floor(n / 10);
    const rem = n % 10;
    if (rem === 0) return TENS[tens];
    if (rem === 1) return `${TENS[tens]} et un`;
    return `${TENS[tens]}-${UNITS[rem]}`;
  }
  if (n < 80) {
    const rem = n - 60; // 10..19
    return rem === 11 ? 'soixante et onze' : `soixante-${UNITS[rem]}`;
  }
  const rem = n - 80; // 0..19
  return rem === 0 ? 'quatre-vingts' : `quatre-vingt-${UNITS[rem]}`;
}

/** 0-999. "cent"/"cents" follows the standard singular-when-followed-by-more rule. */
function threeDigits(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rem = n % 100;
  let result = '';
  if (hundreds > 0) {
    result = hundreds === 1 ? 'cent' : `${UNITS[hundreds]} cent`;
    if (rem === 0 && hundreds > 1) result += 's';
  }
  if (rem > 0) result = result ? `${result} ${twoDigits(rem)}` : twoDigits(rem);
  return result;
}

/** "vingts"/"cents" only pluralize when terminal — strip the 's' when another number word follows. */
function dropTerminalS(word: string): string {
  return word.replace(/vingts$/, 'vingt').replace(/cents$/, 'cent');
}

const SCALES = [
  { value: 1_000_000_000, singular: 'milliard', plural: 'milliards' },
  { value: 1_000_000, singular: 'million', plural: 'millions' },
] as const;

/** French cardinal number-to-words, for whole non-negative integers (this codebase stores amounts without cents). */
export function numberToFrenchWords(n: number): string {
  if (!Number.isInteger(n) || n < 0) throw new Error(`numberToFrenchWords: expected a non-negative integer, got ${n}`);
  if (n === 0) return 'zéro';

  let remaining = n;
  const parts: string[] = [];

  for (const scale of SCALES) {
    const count = Math.floor(remaining / scale.value);
    if (count > 0) {
      remaining -= count * scale.value;
      const word = count === 1 ? scale.singular : scale.plural;
      parts.push(count === 1 ? `un ${word}` : `${dropTerminalS(threeDigits(count))} ${word}`);
    }
  }

  const thousands = Math.floor(remaining / 1_000);
  if (thousands > 0) {
    remaining -= thousands * 1_000;
    parts.push(thousands === 1 ? 'mille' : `${dropTerminalS(threeDigits(thousands))} mille`);
  }

  if (remaining > 0 || parts.length === 0) parts.push(threeDigits(remaining));

  return parts.join(' ');
}

const CURRENCY_WORDS: Record<string, string> = {
  USD: 'dollars américains',
  CDF: 'francs congolais',
  CAD: 'dollars canadiens',
};

/** e.g. `amountInWords(1150, 'USD')` → "Mille cent cinquante dollars américains". */
export function amountInWords(amount: number, currency: string): string {
  const words = numberToFrenchWords(Math.round(amount));
  const capitalized = words.charAt(0).toUpperCase() + words.slice(1);
  return `${capitalized} ${CURRENCY_WORDS[currency] ?? currency}`;
}
