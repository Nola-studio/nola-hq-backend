import { test, expect, describe } from 'bun:test';
import {
  STUDIO_PRIORITY_TO_WORK_ITEM_PRIORITY,
  STUDIO_STATUS_TO_WORK_ITEM_STATUS,
  WORK_ITEM_PRIORITY_TO_STUDIO_PRIORITY,
  WORK_ITEM_STATUS_TO_STUDIO_STATUS,
} from './work-item-studio-mapping';
import { WORK_ITEM_PRIORITIES, WORK_ITEM_STATUSES } from './work-item.entity';

describe('work-item-studio-mapping', () => {
  test('maps every Studio status to a valid WorkItem status', () => {
    for (const status of Object.values(STUDIO_STATUS_TO_WORK_ITEM_STATUS)) {
      expect(WORK_ITEM_STATUSES).toContain(status);
    }
  });

  test('maps every WorkItem status back to a Studio status', () => {
    for (const status of WORK_ITEM_STATUSES) {
      expect(WORK_ITEM_STATUS_TO_STUDIO_STATUS[status]).toBeDefined();
    }
  });

  test('maps every Studio priority to a valid WorkItem priority', () => {
    for (const priority of Object.values(STUDIO_PRIORITY_TO_WORK_ITEM_PRIORITY)) {
      expect(WORK_ITEM_PRIORITIES).toContain(priority);
    }
  });

  test('maps every WorkItem priority back to a Studio priority', () => {
    for (const priority of WORK_ITEM_PRIORITIES) {
      expect(WORK_ITEM_PRIORITY_TO_STUDIO_PRIORITY[priority]).toBeDefined();
    }
  });

  test('folds Studio none/low into WorkItem P3', () => {
    expect(STUDIO_PRIORITY_TO_WORK_ITEM_PRIORITY.none).toBe('P3');
    expect(STUDIO_PRIORITY_TO_WORK_ITEM_PRIORITY.low).toBe('P3');
  });
});
