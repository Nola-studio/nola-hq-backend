import { test, expect, describe } from 'bun:test';
import {
  clampProgress,
  deriveInitiativeProgress,
  deriveObjectiveProgress,
} from './roadmap.progress';

/**
 * The two rules the whole roadmap read model rests on:
 *   - an initiative with milestones is `done / total`, otherwise it is the
 *     manually-set stored value;
 *   - an objective is the mean of its initiatives, dropped ones excluded.
 * Pure functions — no DB, no Nest.
 */

const milestones = (...done: boolean[]) => done.map((d) => ({ done: d }));

describe('deriveInitiativeProgress', () => {
  test('no milestone → the manually-set stored value wins', () => {
    expect(deriveInitiativeProgress(42, [])).toBe(42);
    expect(deriveInitiativeProgress(0, [])).toBe(0);
    expect(deriveInitiativeProgress(100, [])).toBe(100);
  });

  test('with milestones → derived from the checklist, stored value ignored', () => {
    expect(deriveInitiativeProgress(99, milestones(false, false))).toBe(0);
    expect(deriveInitiativeProgress(0, milestones(true, true))).toBe(100);
    expect(deriveInitiativeProgress(7, milestones(true, false))).toBe(50);
  });

  test('rounds to the nearest integer percent', () => {
    expect(deriveInitiativeProgress(0, milestones(true, false, false))).toBe(33);
    expect(deriveInitiativeProgress(0, milestones(true, true, false))).toBe(67);
    expect(
      deriveInitiativeProgress(0, milestones(true, false, false, false, false, false, false, false)),
    ).toBe(13); // 12.5 → 13
  });

  test('clamps a corrupt stored value instead of leaking it', () => {
    expect(deriveInitiativeProgress(-10, [])).toBe(0);
    expect(deriveInitiativeProgress(1000, [])).toBe(100);
    expect(deriveInitiativeProgress(NaN, [])).toBe(0);
  });
});

describe('deriveObjectiveProgress', () => {
  test('no initiative → 0', () => {
    expect(deriveObjectiveProgress([])).toBe(0);
  });

  test('mean of its initiatives', () => {
    expect(
      deriveObjectiveProgress([
        { status: 'in_progress', progress: 20 },
        { status: 'shipped', progress: 100 },
        { status: 'idea', progress: 0 },
      ]),
    ).toBe(40);
  });

  test('excludes dropped initiatives from the mean', () => {
    // Without the exclusion the mean would be 50, not 100.
    expect(
      deriveObjectiveProgress([
        { status: 'shipped', progress: 100 },
        { status: 'dropped', progress: 0 },
      ]),
    ).toBe(100);
  });

  test('only dropped initiatives → 0 (nothing left to count)', () => {
    expect(
      deriveObjectiveProgress([
        { status: 'dropped', progress: 80 },
        { status: 'dropped', progress: 100 },
      ]),
    ).toBe(0);
  });

  test('rounds the mean', () => {
    expect(
      deriveObjectiveProgress([
        { status: 'idea', progress: 50 },
        { status: 'idea', progress: 51 },
      ]),
    ).toBe(51); // 50.5 → 51
    expect(
      deriveObjectiveProgress([
        { status: 'idea', progress: 10 },
        { status: 'idea', progress: 10 },
        { status: 'idea', progress: 11 },
      ]),
    ).toBe(10); // 10.33 → 10
  });
});

describe('clampProgress', () => {
  test('keeps 0..100 integers, rejects the rest', () => {
    expect(clampProgress(0)).toBe(0);
    expect(clampProgress(100)).toBe(100);
    expect(clampProgress(33.4)).toBe(33);
    expect(clampProgress(-1)).toBe(0);
    expect(clampProgress(101)).toBe(100);
    expect(clampProgress(Infinity)).toBe(0);
  });
});
