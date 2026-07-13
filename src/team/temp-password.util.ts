import { randomInt } from 'crypto';

// Ambiguity-free character classes (no I/l/1/O/0) so a temporary password read
// off a screen or a chat message can't be mistyped.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGIT = '23456789';
const SYMBOL = '!@#$%*?-_';

function pick(set: string): string {
  return set[randomInt(set.length)]!;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/**
 * Cryptographically-strong temporary password with at least one upper, lower,
 * digit and symbol — satisfies a typical Keycloak password policy. Set as a
 * `temporary` credential so Keycloak forces a change at first login; never
 * persisted server-side (returned once to the caller).
 */
export function generateTempPassword(length = 16): string {
  const all = UPPER + LOWER + DIGIT + SYMBOL;
  const required = [pick(UPPER), pick(LOWER), pick(DIGIT), pick(SYMBOL)];
  const rest = Array.from({ length: Math.max(0, length - required.length) }, () =>
    pick(all),
  );
  return shuffle([...required, ...rest]).join('');
}
