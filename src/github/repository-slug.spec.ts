import { describe, expect, test } from 'bun:test';
import {
  InvalidRepositoryRef,
  parseRepositoryRef,
  repositorySlug,
  sameRepository,
} from './repository-slug';

describe('parseRepositoryRef', () => {
  test('la forme courte', () => {
    expect(parseRepositoryRef('nola-studio/nola-hq')).toEqual({ owner: 'nola-studio', name: 'nola-hq' });
  });

  /** Ce que les gens collent réellement : l'URL de la barre d'adresse. */
  test('une URL HTTPS, avec ou sans .git, avec ou sans slash final', () => {
    const expected = { owner: 'nola-studio', name: 'nola-hq' };
    expect(parseRepositoryRef('https://github.com/nola-studio/nola-hq')).toEqual(expected);
    expect(parseRepositoryRef('https://github.com/nola-studio/nola-hq.git')).toEqual(expected);
    expect(parseRepositoryRef('https://github.com/nola-studio/nola-hq/')).toEqual(expected);
  });

  test('une URL SSH', () => {
    expect(parseRepositoryRef('git@github.com:nola-studio/nola-hq.git')).toEqual({
      owner: 'nola-studio',
      name: 'nola-hq',
    });
  });

  /** Copier depuis une page de fichier ne doit pas coller la branche au nom. */
  test('un chemin profond est ramené au dépôt', () => {
    expect(parseRepositoryRef('https://github.com/nola-studio/nola-hq/tree/main/src')).toEqual({
      owner: 'nola-studio',
      name: 'nola-hq',
    });
    expect(parseRepositoryRef('https://github.com/nola-studio/nola-hq/pull/42#issuecomment-1')).toEqual({
      owner: 'nola-studio',
      name: 'nola-hq',
    });
  });

  test('les espaces autour sont ignorés', () => {
    expect(parseRepositoryRef('  nola-studio/nola-hq  ')).toEqual({
      owner: 'nola-studio',
      name: 'nola-hq',
    });
  });

  test('un point ou un tiret bas dans le nom est légitime', () => {
    expect(parseRepositoryRef('nola-studio/nola.hq_v2')).toEqual({
      owner: 'nola-studio',
      name: 'nola.hq_v2',
    });
  });

  describe('refus', () => {
    test('sans propriétaire', () => {
      expect(() => parseRepositoryRef('nola-hq')).toThrow(InvalidRepositoryRef);
    });

    test('vide', () => {
      expect(() => parseRepositoryRef('   ')).toThrow('Dépôt vide.');
    });

    /** GitHub refuse un tiret en bordure de login ; le refuser ici évite un 404. */
    test('un propriétaire mal formé', () => {
      expect(() => parseRepositoryRef('-nola/hq')).toThrow(/Propriétaire/);
      expect(() => parseRepositoryRef('nola-/hq')).toThrow(/Propriétaire/);
      expect(() => parseRepositoryRef('a'.repeat(40) + '/hq')).toThrow(/Propriétaire/);
    });

    test('un nom mal formé', () => {
      expect(() => parseRepositoryRef('nola/hq!')).toThrow(/Nom de dépôt/);
      expect(() => parseRepositoryRef('nola/..')).toThrow(/Nom de dépôt/);
      expect(() => parseRepositoryRef(`nola/${'a'.repeat(101)}`)).toThrow(/Nom de dépôt/);
    });

    /** `.git` retiré ne doit pas laisser un nom vide. */
    test('un nom réduit à .git', () => {
      expect(() => parseRepositoryRef('nola/.git')).toThrow(InvalidRepositoryRef);
    });
  });
});

describe('repositorySlug', () => {
  test('recompose la forme canonique', () => {
    expect(repositorySlug({ owner: 'nola-studio', name: 'nola-hq' })).toBe('nola-studio/nola-hq');
  });

  test('faire l’aller-retour ne change rien', () => {
    const slug = 'nola-studio/nola-hq-backend';
    expect(repositorySlug(parseRepositoryRef(slug))).toBe(slug);
  });
});

describe('sameRepository', () => {
  /** GitHub retrouve un dépôt sans distinguer la casse ; deux enregistrements
   *  ne doivent pas cohabiter parce que l'un dit `Nola-studio`. */
  test('la casse ne distingue pas deux dépôts', () => {
    expect(
      sameRepository({ owner: 'Nola-Studio', name: 'Nola-HQ' }, { owner: 'nola-studio', name: 'nola-hq' }),
    ).toBe(true);
  });

  test('deux dépôts différents restent différents', () => {
    expect(
      sameRepository({ owner: 'nola-studio', name: 'nola-hq' }, { owner: 'nola-studio', name: 'nola-hq-backend' }),
    ).toBe(false);
  });
});
