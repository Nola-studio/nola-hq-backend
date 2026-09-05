import { describe, expect, mock, test } from 'bun:test';
import { branchNameFor } from './branch-name';
import { matchReference, referenceCandidatesFrom, stripRefsHeads } from './branch-reference';

describe('stripRefsHeads', () => {
  test('les deux formes désignent la même branche', () => {
    expect(stripRefsHeads('refs/heads/feature/GOV-01-x')).toBe('feature/GOV-01-x');
    expect(stripRefsHeads('feature/GOV-01-x')).toBe('feature/GOV-01-x');
  });
});

describe('referenceCandidatesFrom', () => {
  /**
   * Le cas qui compte : une user story ne doit pas être rattachée à l'epic
   * dont elle porte la clé. D'où l'ordre, du plus long au plus court.
   */
  test('les candidats vont du plus long au plus court', () => {
    expect(referenceCandidatesFrom('feature/US-GOV-01-1-consulter-la-structure')).toEqual([
      'US-GOV-01-1',
      'US-GOV-01',
    ]);
  });

  test('une clé simple', () => {
    expect(referenceCandidatesFrom('feature/GOV-01-registre')).toEqual(['GOV-01']);
  });

  test('les cinq préfixes sont reconnus', () => {
    for (const prefix of ['feature', 'fix', 'hotfix', 'chore', 'spike']) {
      expect(referenceCandidatesFrom(`${prefix}/ENG-08-x`)).toEqual(['ENG-08']);
    }
  });

  test('une branche sans préfixe connu est lue telle quelle', () => {
    expect(referenceCandidatesFrom('GOV-01-registre')).toEqual(['GOV-01']);
  });

  test('une branche sans clé ne propose rien', () => {
    expect(referenceCandidatesFrom('main')).toEqual([]);
    expect(referenceCandidatesFrom('feature/refonte-du-menu')).toEqual([]);
    expect(referenceCandidatesFrom('')).toEqual([]);
  });

  test('la forme refs/heads est acceptée', () => {
    expect(referenceCandidatesFrom('refs/heads/fix/ENG-08-la-branche')).toEqual(['ENG-08']);
  });

  /** Un slug qui contient un nombre ne doit pas fabriquer une fausse clé. */
  test('un nombre dans le slug produit un candidat qu’aucun ticket ne portera', () => {
    const candidats = referenceCandidatesFrom('feature/GOV-01-migrer-vers-v2');
    expect(candidats).toContain('GOV-01');
    // Le candidat le plus long est accepté seulement s'il existe en base —
    // c'est le rôle de `matchReference`, pas de cette fonction.
    expect(candidats[0]).toBe('GOV-01-migrer-vers-v2');
  });

  /**
   * L'aller-retour : tout nom produit par `branchNameFor` doit rendre sa
   * propre clé parmi les candidats.
   */
  test('aller-retour avec branchNameFor', () => {
    const cas = [
      { type: 'story' as const, reference: 'GOV-01', title: 'Registre canonique' },
      { type: 'bug' as const, reference: 'ENG-08', title: 'La branche perd sa clé' },
      { type: 'story' as const, reference: 'US-GOV-01-1', title: 'En tant que dirigeant, je veux voir' },
      { type: 'spike' as const, reference: 'REL-00', title: 'Registre applicatif' },
    ];
    for (const c of cas) {
      expect(referenceCandidatesFrom(branchNameFor(c))).toContain(c.reference);
    }
  });
});

describe('matchReference', () => {
  test('rend la première clé qui existe', async () => {
    const known = mock(async (r: string) => r === 'US-GOV-01');
    expect(await matchReference('feature/US-GOV-01-1-x', known)).toBe('US-GOV-01');
  });

  /** La plus longue gagne quand les deux existent. */
  test('la user story l’emporte sur son epic', async () => {
    const known = mock(async (r: string) => ['US-GOV-01-1', 'US-GOV-01'].includes(r));
    expect(await matchReference('feature/US-GOV-01-1-x', known)).toBe('US-GOV-01-1');
  });

  test('aucune correspondance rend null', async () => {
    expect(await matchReference('feature/refonte', mock(async () => true))).toBeNull();
    expect(await matchReference('feature/GOV-99-x', mock(async () => false))).toBeNull();
  });

  /** On ne charge pas la table des tickets pour reconnaître une branche. */
  test('la recherche s’arrête au premier succès', async () => {
    const known = mock(async () => true);
    await matchReference('feature/US-GOV-01-1-x', known);
    expect(known).toHaveBeenCalledTimes(1);
  });
});
