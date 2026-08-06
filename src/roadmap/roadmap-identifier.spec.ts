import { test, expect, describe } from 'bun:test';
import { slugifyProjectName, projectIdentifier, taskReference } from './roadmap-identifier';

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
