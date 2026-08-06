/**
 * Auto-generated project/task identifiers, workbook convention: project
 * "Nolaa" -> keyPrefix "Nolaa" -> project id "PNolaa", tasks "TNolaa01",
 * "TNolaa02", ... Never typed by a user - `keyPrefix` is derived from the
 * project title at creation time and is immutable afterward.
 */

const COMBINING_MARKS = /[\u0300-\u036f]/g;
const NON_ALPHANUMERIC = /[^A-Za-z0-9]/g;

/** Strips accents, spaces and punctuation; keeps the source casing. Falls back to `Projet` for an all-punctuation name. */
export function slugifyProjectName(name: string): string {
  const stripped = name.normalize('NFD').replace(COMBINING_MARKS, '').replace(NON_ALPHANUMERIC, '');
  return stripped || 'Projet';
}

export function projectIdentifier(keyPrefix: string): string {
  return `P${keyPrefix}`;
}

export function taskReference(keyPrefix: string, seq: number): string {
  return `T${keyPrefix}${String(seq).padStart(2, '0')}`;
}
