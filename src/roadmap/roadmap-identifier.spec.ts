import { test, expect, describe } from 'bun:test';
import { slugifyProjectName, projectIdentifier, taskReference, backfillKeyPrefixes } from './roadmap-identifier';

describe('slugifyProjectName', () => {
  test('strips spaces', () => {
    expect(slugifyProjectName('Nolaa HQ')).toBe('NolaaHQ');
  });

  test('strips accents', () => {
    expect(slugifyProjectName('Étude café')).toBe('Etudecafe');
  });

  test('strips punctuation', () => {
    expect(slugifyProjectName("K-River!")).toBe('KRiver');
  });

  test('keeps source casing', () => {
    expect(slugifyProjectName('Nolaa')).toBe('Nolaa');
  });

  test('falls back to Projet for an all-punctuation name', () => {
    expect(slugifyProjectName('---')).toBe('Projet');
  });
});

describe('projectIdentifier / taskReference', () => {
  test('project identifier prefixes with P', () => {
    expect(projectIdentifier('Nolaa')).toBe('PNolaa');
  });

  test('task reference prefixes with T and zero-pads to 2 digits', () => {
    expect(taskReference('Nolaa', 1)).toBe('TNolaa01');
    expect(taskReference('Nolaa', 9)).toBe('TNolaa09');
    expect(taskReference('Nolaa', 42)).toBe('TNolaa42');
  });

  test('task reference does not truncate beyond 2 digits', () => {
    expect(taskReference('Nolaa', 123)).toBe('TNolaa123');
  });
});

describe('backfillKeyPrefixes', () => {
  test('assigns a slug to a null-key row that never had a keyPrefix', () => {
    const assignments = backfillKeyPrefixes([{ id: '1', title: 'Nolaa HQ' }], []);
    expect(assignments).toEqual([{ id: '1', keyPrefix: 'NolaaHQ' }]);
  });

  test('dedupes against already-assigned prefixes with a numeric suffix', () => {
    const assignments = backfillKeyPrefixes([{ id: '1', title: 'Nolaa' }], ['Nolaa']);
    expect(assignments).toEqual([{ id: '1', keyPrefix: 'Nolaa2' }]);
  });

  test('dedupes within the same batch, in row order', () => {
    const assignments = backfillKeyPrefixes(
      [
        { id: '1', title: 'Nolaa' },
        { id: '2', title: 'Nolaa' },
        { id: '3', title: 'Nolaa' },
      ],
      [],
    );
    expect(assignments).toEqual([
      { id: '1', keyPrefix: 'Nolaa' },
      { id: '2', keyPrefix: 'Nolaa2' },
      { id: '3', keyPrefix: 'Nolaa3' },
    ]);
  });

  test('rows with distinct titles never collide', () => {
    const assignments = backfillKeyPrefixes(
      [
        { id: '1', title: 'Yekoli' },
        { id: '2', title: 'K-River' },
      ],
      ['Nolaa'],
    );
    expect(assignments).toEqual([
      { id: '1', keyPrefix: 'Yekoli' },
      { id: '2', keyPrefix: 'KRiver' },
    ]);
  });
});
