/**
 * Auto-generated project/task identifiers, workbook convention: project
 * "Nolaa" -> keyPrefix "Nolaa" -> project id "PNolaa", tasks "TNolaa01",
 * "TNolaa02", ... Never typed by a user - `keyPrefix` is derived from the
 * project title at creation time and is immutable afterward.
 */

const COMBINING_MARKS = /[\u0300-\u036f]/g;
const NON_ALPHANUMERIC = /[^A-Za-z0-9]/g;

/**
 * `roadmap_initiatives.key_prefix` is `varchar(12)`. Reserve 2 chars for a
 * numeric collision suffix (`generateKeyPrefix`/`backfillKeyPrefixes` both
 * append one on a duplicate) so the longest possible candidate
 * (`<10 chars><2-digit suffix>`) still fits.
 */
const MAX_SLUG_LENGTH = 10;

/**
 * Strips accents, spaces and punctuation, then truncates to fit
 * `key_prefix`; keeps the source casing. Falls back to `Projet` for an
 * all-punctuation name. A title with no separators (e.g. "Ajouter
 * connexion hors ligne" written as one run-on word) would otherwise slugify
 * past the column limit and fail the `UPDATE`/`INSERT` outright.
 */
export function slugifyProjectName(name: string): string {
  const stripped = name.normalize('NFD').replace(COMBINING_MARKS, '').replace(NON_ALPHANUMERIC, '');
  return stripped.slice(0, MAX_SLUG_LENGTH) || 'Projet';
}

export function projectIdentifier(keyPrefix: string): string {
  return `P${keyPrefix}`;
}

export function taskReference(keyPrefix: string, seq: number): string {
  return `T${keyPrefix}${String(seq).padStart(2, '0')}`;
}

export interface KeyPrefixBackfillRow {
  id: string;
  title: string;
}

export interface KeyPrefixAssignment {
  id: string;
  keyPrefix: string;
}

/**
 * Assigns a `keyPrefix` to every row missing one — same slugify + numeric-
 * suffix-on-collision rule as `RoadmapService.generateKeyPrefix()`, but
 * batched and DB-free so a migration (or a test) can call it without a live
 * connection. `existingPrefixes` should include every already-assigned
 * prefix in the table; `rows` should be in a stable order (e.g. by
 * `createdAt`) so re-running produces the same assignment.
 */
export function backfillKeyPrefixes(
  rows: KeyPrefixBackfillRow[],
  existingPrefixes: Iterable<string>,
): KeyPrefixAssignment[] {
  const taken = new Set(existingPrefixes);
  const assignments: KeyPrefixAssignment[] = [];
  for (const row of rows) {
    const base = slugifyProjectName(row.title);
    let candidate = base;
    for (let suffix = 2; taken.has(candidate); suffix += 1) {
      candidate = `${base}${suffix}`;
    }
    taken.add(candidate);
    assignments.push({ id: row.id, keyPrefix: candidate });
  }
  return assignments;
}
