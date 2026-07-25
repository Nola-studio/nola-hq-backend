/**
 * Pure progress arithmetic for the roadmap — no Nest/DB deps so it can be
 * unit-tested in isolation (`bun test`). `RoadmapService` wires the fetching
 * and delegates every percentage computation here; the arithmetic must not
 * be duplicated anywhere else.
 */

/** Minimal milestone shape the math needs (decoupled from the entity). */
export interface ProgressMilestone {
  done: boolean;
}

/** Minimal initiative shape the math needs (decoupled from the entity). */
export interface ProgressInitiative {
  status: string;
  progress: number;
}

/** Clamps to the 0..100 integer range; anything non-numeric becomes 0. */
export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * Effective progress of an initiative.
 *
 *   - **With milestones** → derived: `done / total`, in percent, rounded.
 *     The stored column is ignored (the checklist wins).
 *   - **Without milestones** → the manually-set stored value, clamped.
 */
export function deriveInitiativeProgress(
  stored: number,
  milestones: ProgressMilestone[],
): number {
  if (milestones.length === 0) return clampProgress(stored);
  const done = milestones.filter((m) => m.done).length;
  return clampProgress((done / milestones.length) * 100);
}

/**
 * Effective progress of an objective: the mean of its initiatives' effective
 * progress, **excluding dropped ones** (abandoned work must not drag the
 * objective down, nor inflate it). 0 when the objective has no initiative —
 * or none left once the dropped ones are excluded.
 */
export function deriveObjectiveProgress(
  initiatives: ProgressInitiative[],
): number {
  const counted = initiatives.filter((i) => i.status !== 'dropped');
  if (counted.length === 0) return 0;
  const sum = counted.reduce((s, i) => s + clampProgress(i.progress), 0);
  return clampProgress(sum / counted.length);
}
