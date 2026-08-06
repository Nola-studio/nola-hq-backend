import { Matches } from 'class-validator';

/**
 * PATCH /roadmap/initiatives/:id/key-prefix — `hq:owner` only (see
 * `RoadmapController`). `keyPrefix` is otherwise immutable once
 * auto-generated (`RoadmapService.generateKeyPrefix`); this is the one
 * deliberate escape hatch, for correcting an auto-generated prefix that
 * came out truncated/ugly (e.g. a long one-word title) before any task has
 * been filed under it — see `RoadmapService.updateKeyPrefix` for the
 * uniqueness and no-tasks-yet checks.
 */
export class UpdateKeyPrefixDto {
  /** Same shape `slugifyProjectName` produces: letters/digits, starts with a letter, max 10 (2 chars reserved on the column for a future dedup suffix). */
  @Matches(/^[A-Za-z][A-Za-z0-9]{0,9}$/, {
    message: 'Le préfixe doit faire 1 à 10 caractères alphanumériques et commencer par une lettre.',
  })
  keyPrefix!: string;
}
