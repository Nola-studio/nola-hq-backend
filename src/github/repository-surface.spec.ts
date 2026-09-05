import { describe, expect, test } from 'bun:test';
import { narrowBySurface } from './repository-surface';
import type { CodeRepository } from './repository.entity';

/**
 * Le côté d'un ticket restreint ses dépôts — c'est ce qui fait que « Start
 * Work » ne pose plus de question à un projet qui porte un front et un back.
 *
 * Tous les garde-fous vont dans le même sens : ne jamais rendre moins que ce
 * qu'on rendait avant que cette information existe.
 */

const repo = (name: string, side: CodeRepository['side'] = null) =>
  ({ id: name, name, side }) as CodeRepository;

const FRONT = repo('nola-hq', 'frontend');
const BACK = repo('nola-hq-backend', 'backend');
const MONO = repo('nola-mono', 'fullstack');
const UNSET = repo('nola-legacy');

describe('narrowBySurface', () => {
  test('un ticket backend ne garde que le back', () => {
    expect(narrowBySurface([FRONT, BACK], 'backend')).toEqual([BACK]);
  });

  test('un monorepo convient à n’importe quel côté', () => {
    expect(narrowBySurface([MONO, FRONT], 'backend')).toEqual([MONO]);
  });

  test('un ticket des deux côtés ne restreint rien', () => {
    expect(narrowBySurface([FRONT, BACK], 'fullstack')).toEqual([FRONT, BACK]);
  });

  /** On ne devine pas un côté depuis un titre : le silence n'est pas une consigne. */
  test('un ticket sans côté ne restreint rien', () => {
    expect(narrowBySurface([FRONT, BACK], null)).toEqual([FRONT, BACK]);
  });

  /**
   * Tant qu'aucun dépôt n'est classé, la fonctionnalité n'est pas configurée :
   * restreindre cacherait des dépôts sur la foi d'une information absente.
   */
  test('aucun dépôt classé ⇒ rien n’est caché', () => {
    expect(narrowBySurface([UNSET, repo('autre')], 'backend')).toHaveLength(2);
  });

  /** Un dépôt non classé s'efface devant un dépôt qui répond. */
  test('le non classé cède au classé', () => {
    expect(narrowBySurface([UNSET, BACK], 'backend')).toEqual([BACK]);
  });

  /**
   * Un ticket backend dans un projet qui n'a que du front est sans doute mal
   * classé — mais bloquer la création de branche serait une punition, pas un
   * message.
   */
  test('si le filtre ne laisse rien, on rend tout', () => {
    expect(narrowBySurface([FRONT], 'backend')).toEqual([FRONT]);
  });

  test('aucun dépôt reste aucun dépôt', () => {
    expect(narrowBySurface([], 'backend')).toEqual([]);
  });
});
