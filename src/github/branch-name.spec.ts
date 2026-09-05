import { describe, expect, test } from 'bun:test';
import {
  MAX_BRANCH_LENGTH,
  branchNameFor,
  prefixFor,
  slugifyTitle,
  validateBranchName,
} from './branch-name';

describe('prefixFor', () => {
  test('le type décide du préfixe', () => {
    expect(prefixFor('story')).toBe('feature');
    expect(prefixFor('feature')).toBe('feature');
    expect(prefixFor('bug')).toBe('fix');
    expect(prefixFor('spike')).toBe('spike');
    expect(prefixFor('task')).toBe('chore');
    expect(prefixFor('ops')).toBe('chore');
    expect(prefixFor('debt')).toBe('chore');
  });
});

describe('slugifyTitle', () => {
  /** « déployé » doit donner `deploye`, pas `dploy`. */
  test('les accents sont dépliés, pas supprimés', () => {
    expect(slugifyTitle('Déployé en préproduction')).toBe('deploye-en-preproduction');
    expect(slugifyTitle('Créer la façade côté élève')).toBe('creer-la-facade-cote-eleve');
  });

  test('la ponctuation devient un tiret, sans doublon', () => {
    expect(slugifyTitle('Devis → contrat → projet')).toBe('devis-contrat-projet');
    expect(slugifyTitle('P&L par produit (mensuel)')).toBe('p-l-par-produit-mensuel');
  });

  test('pas de tiret en bordure', () => {
    expect(slugifyTitle('  — Registre PI —  ')).toBe('registre-pi');
  });

  /** Une troncature au mauvais endroit laisserait un tiret pendant. */
  test('une troncature ne laisse pas de tiret final', () => {
    const slug = slugifyTitle('a'.repeat(58) + ' bcdef');
    expect(slug).not.toMatch(/-$/);
  });

  /**
   * Les quatorze user stories du référentiel commencent toutes par « En tant
   * que … je veux … ». Garder l'amorce ferait manger la place du besoin par
   * le rôle.
   */
  describe('l’amorce d’une user story est retirée', () => {
    test('la forme du référentiel', () => {
      expect(
        slugifyTitle('En tant que dirigeant, je veux consulter la structure complète du groupe.'),
      ).toBe('consulter-la-structure-complete-du');
    });

    test('sans virgule', () => {
      expect(slugifyTitle('En tant que juriste je veux enregistrer les données légales')).toBe(
        'enregistrer-les-donnees-legales',
      );
    });

    test('« souhaite » et « voudrais » aussi', () => {
      expect(slugifyTitle('En tant qu’agent, je souhaite relier plusieurs incidents')).toBe(
        'relier-plusieurs-incidents',
      );
      expect(slugifyTitle('Je voudrais voir la branche depuis le ticket')).toBe(
        'voir-la-branche-depuis-le-ticket',
      );
    });

    /** Un titre ordinaire ne doit pas être amputé au passage. */
    test('un titre qui n’est pas une user story est intact', () => {
      expect(slugifyTitle('Je veux dire, le registre canonique')).toBe('dire-le-registre-canonique');
      expect(slugifyTitle('Registre canonique des entités')).toBe('registre-canonique-des-entites');
      expect(slugifyTitle('Entretien : je veux bien')).toBe('entretien-je-veux-bien');
    });
  });

  /** `…-du-group` se lit comme une faute ; `…-du` se lit comme une coupure. */
  test('la troncature tombe sur une frontière de mot', () => {
    const slug = slugifyTitle('consulter la structure complete du groupe scolaire entier');
    expect(slug).not.toMatch(/-$/);
    expect(slug.split('-').at(-1)).toBe('du');
  });

  /** Sauf quand remonter au tiret ne laisserait presque rien. */
  test('un premier mot très long est coupé franchement', () => {
    expect(slugifyTitle('a'.repeat(50) + ' fin')).toBe('a'.repeat(40));
  });

  test('un titre sans lettre ni chiffre donne une chaîne vide', () => {
    expect(slugifyTitle('!!! ??? ...')).toBe('');
  });
});

describe('branchNameFor', () => {
  test('la convention du référentiel', () => {
    expect(
      branchNameFor({ type: 'story', reference: 'GOV-01', title: 'Registre canonique des entités' }),
    ).toBe('feature/GOV-01-registre-canonique-des-entites');
  });

  test('un bug donne fix/', () => {
    expect(branchNameFor({ type: 'bug', reference: 'ENG-08', title: 'La branche perd sa clé' })).toBe(
      'fix/ENG-08-la-branche-perd-sa-cle',
    );
  });

  test('la clé garde sa casse — c’est elle qu’on cherche des yeux', () => {
    expect(branchNameFor({ type: 'story', reference: 'US-ENG-08-1', title: 'Créer une branche' })).toBe(
      'feature/US-ENG-08-1-creer-une-branche',
    );
  });

  /** `hotfix` ne se déduit d'aucun type : il se demande. */
  test('le préfixe peut être forcé', () => {
    expect(
      branchNameFor({ type: 'bug', reference: 'SUP-01', title: 'Fuite mémoire', prefix: 'hotfix' }),
    ).toBe('hotfix/SUP-01-fuite-memoire');
  });

  describe('quand la place manque', () => {
    const LONG = 'Nolaa HQ doit permettre à un membre autorisé de démarrer le travail technique';

    test('le nom reste sous la limite', () => {
      const name = branchNameFor({ type: 'story', reference: 'ENG-08', title: LONG });
      expect(name.length).toBeLessThanOrEqual(MAX_BRANCH_LENGTH);
    });

    /** La règle qui compte : la clé passe toujours, c'est le slug qui trinque. */
    test('la clé est intacte, et le nom ne finit pas sur un tiret', () => {
      const name = branchNameFor({ type: 'story', reference: 'ENG-08', title: LONG });
      expect(name.startsWith('feature/ENG-08-')).toBe(true);
      expect(name).not.toMatch(/-$/);
    });

    test('une clé qui remplit à elle seule la limite laisse tomber le slug', () => {
      const name = branchNameFor({ type: 'task', reference: 'A'.repeat(74), title: 'Un titre' });
      expect(name).toBe(`chore/${'A'.repeat(74)}`);
    });
  });

  test('un titre vide donne préfixe et clé, sans tiret pendant', () => {
    expect(branchNameFor({ type: 'task', reference: 'GOV-01', title: '   ' })).toBe('chore/GOV-01');
  });

  /**
   * Les clés viennent d'un référentiel écrit à la main. Une clé exotique doit
   * produire un nom valide, pas un 422 de GitHub qu'on ne saurait pas lire.
   */
  describe('clés hostiles', () => {
    test('les espaces et caractères interdits deviennent des tirets', () => {
      expect(branchNameFor({ type: 'task', reference: 'GOV 01', title: 'x' })).toBe('chore/GOV-01-x');
      expect(branchNameFor({ type: 'task', reference: 'GOV~01', title: 'x' })).toBe('chore/GOV-01-x');
      expect(branchNameFor({ type: 'task', reference: 'GOV:01?', title: 'x' })).toBe('chore/GOV-01-x');
    });

    test('« .. » ne survit pas', () => {
      expect(branchNameFor({ type: 'task', reference: 'GOV..01', title: 'x' })).toBe('chore/GOV-01-x');
    });

    test('une barre oblique dans la clé n’ajoute pas de niveau', () => {
      expect(branchNameFor({ type: 'task', reference: 'GOV/01', title: 'x' })).toBe('chore/GOV-01-x');
    });

    test('un point ou un tiret en bordure est retiré', () => {
      expect(branchNameFor({ type: 'task', reference: '.GOV-01.', title: 'x' })).toBe('chore/GOV-01-x');
    });

    test('« .lock » est retiré — git le réserve', () => {
      expect(branchNameFor({ type: 'task', reference: 'GOV-01.lock', title: 'x' })).toBe('chore/GOV-01-x');
    });

    test('une clé qui ne laisse rien est une erreur, pas une branche anonyme', () => {
      expect(() => branchNameFor({ type: 'task', reference: '...', title: 'x' })).toThrow(/clé stable/);
      expect(() => branchNameFor({ type: 'task', reference: '   ', title: 'x' })).toThrow(/clé stable/);
    });
  });

  /** Tout ce que ce module produit doit passer sa propre validation. */
  test('les noms produits sont toujours valides', () => {
    const cases = [
      { type: 'story' as const, reference: 'GOV-01', title: 'Registre canonique' },
      { type: 'bug' as const, reference: 'ENG-08', title: '!!! ???' },
      { type: 'task' as const, reference: 'GOV..01', title: 'Déployé — côté élève' },
      { type: 'spike' as const, reference: 'US-ENG-08-1', title: 'a'.repeat(200) },
      { type: 'debt' as const, reference: 'A'.repeat(74), title: 'Un titre' },
    ];
    for (const input of cases) {
      expect(validateBranchName(branchNameFor(input))).toEqual({ ok: true });
    }
  });
});

describe('validateBranchName', () => {
  test('un nom courant passe', () => {
    expect(validateBranchName('feature/GOV-01-registre')).toEqual({ ok: true });
    expect(validateBranchName('main')).toEqual({ ok: true });
    expect(validateBranchName('release/1.2.3')).toEqual({ ok: true });
  });

  /** Chaque refus dit lequel des interdits de git a été touché. */
  test('les interdits de git, un par un', () => {
    const refus = (name: string) => (validateBranchName(name) as { reason: string }).reason;

    expect(refus('')).toMatch(/vide/);
    expect(refus(' feature/x')).toMatch(/espaces/);
    expect(refus('feature/a b')).toMatch(/Caractères interdits/);
    expect(refus('feature/a~b')).toMatch(/Caractères interdits/);
    expect(refus('feature/a..b')).toMatch(/\.\./);
    expect(refus('feature//x')).toMatch(/barres obliques/i);
    expect(refus('/feature/x')).toMatch(/bordure/);
    expect(refus('feature/x/')).toMatch(/bordure/);
    expect(refus('feature/x.')).toMatch(/point/);
    expect(refus('feature/x.lock')).toMatch(/lock/);
    expect(refus('@')).toMatch(/@/);
    expect(refus('feature/.cache')).toMatch(/point/);
    expect(refus('a'.repeat(256))).toMatch(/trop long/);
  });

  test('un caractère de contrôle est refusé', () => {
    expect(validateBranchName('feature/a\u0007b').ok).toBe(false);
    expect(validateBranchName('feature/a\u007fb').ok).toBe(false);
  });
});
