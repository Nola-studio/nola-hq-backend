import { describe, expect, test } from 'bun:test';
import { parseExecutionReference, summarize } from './execution-reference.parser';

/**
 * A trimmed referential with the shapes that matter: two domains, nested
 * capabilities, an epic with a priority and a numbered story list, an epic
 * with neither, and the prose-instead-of-a-list case the real v1.3 contains
 * twice.
 */
const DOCUMENT = `# Référentiel fonctionnel

## 1. Résumé exécutif

Du texte d'introduction qui ne doit rien produire.

### Domaine 1 — Groupe et gouvernance

Cette section du guide §4A décrit le domaine sans le déclarer.

# Domaine 1 — Groupe et gouvernance

## Finalité

Décrire juridiquement NolaaStudio.

### Capacité 1.1 — Registre corporatif

#### EPIC GOV-01 — Registre canonique des entités

**Priorité : P0**

User stories :

1. En tant que dirigeant, je veux consulter la structure du groupe.
2. En tant que juriste, je veux enregistrer les données légales.

Tâches principales :

- modéliser société et filiale ;
- historiser les transformations.

#### EPIC GOV-03 — Conseils et résolutions

User stories : préparer une séance et consigner une résolution.

### Capacité 1.2 — Décisions et délégations

#### EPIC GOV-04 — Registre des décisions

Chaque décision doit contenir contexte et options.

# Domaine 6 — Projets, ingénierie et qualité

### Capacité 6.5 — Development Workspace

#### EPIC ENG-08 — Start Work & Branch Automation

**Priorité : P0**

Un contenu quelconque.
`;

describe('parseExecutionReference', () => {
  const parsed = parseExecutionReference(DOCUMENT);
  const byKey = new Map(parsed.items.map((i) => [i.sourceKey, i]));

  test('extrait la hiérarchie déclarée, et rien d’autre', () => {
    expect(summarize(parsed)).toEqual({ domain: 2, capability: 3, epic: 4, story: 2 });
  });

  /** Le guide §4A emploie « ### Domaine N » ; seul « # Domaine N » déclare. */
  test('ignore les titres de domaine du guide narratif', () => {
    expect(parsed.items.filter((i) => i.kind === 'domain').map((i) => i.sourceKey)).toEqual(['D01', 'D06']);
  });

  test('les codes sont normalisés sur deux chiffres', () => {
    expect(byKey.get('D06')).toBeDefined();
    expect(byKey.get('D06.C05')).toBeDefined();
    expect(byKey.get('D6')).toBeUndefined();
  });

  /**
   * Le numéro de la capacité dit lui-même son domaine, donc le rattachement
   * ne dépend pas de l'ordre des sections.
   */
  test('une capacité se rattache à son domaine par son propre numéro', () => {
    expect(byKey.get('D01.C02')!.parentKey).toBe('D01');
    expect(byKey.get('D06.C05')!.parentKey).toBe('D06');
  });

  test('un epic se rattache à la capacité qui le contient', () => {
    expect(byKey.get('GOV-01')!.parentKey).toBe('D01.C01');
    expect(byKey.get('GOV-04')!.parentKey).toBe('D01.C02');
    expect(byKey.get('ENG-08')!.parentKey).toBe('D06.C05');
  });

  test('la priorité est rattachée à l’epic qu’elle suit, pas au suivant', () => {
    expect(byKey.get('GOV-01')!.priority).toBe('P0');
    expect(byKey.get('GOV-03')!.priority).toBeNull();
    expect(byKey.get('GOV-04')!.priority).toBeNull();
    expect(byKey.get('ENG-08')!.priority).toBe('P0');
  });

  test('les user stories numérotées deviennent des items rattachés à leur epic', () => {
    const stories = parsed.items.filter((i) => i.kind === 'story');
    expect(stories.map((s) => s.sourceKey)).toEqual(['US-GOV-01-1', 'US-GOV-01-2']);
    expect(stories[0].parentKey).toBe('GOV-01');
    expect(stories[0].title).toBe('En tant que dirigeant, je veux consulter la structure du groupe.');
  });

  test('une story hérite de la priorité de son epic', () => {
    expect(parsed.items.find((i) => i.sourceKey === 'US-GOV-01-1')!.priority).toBe('P0');
  });

  /** Ce que le parser ne sait pas lire, il le signale au lieu de le perdre. */
  test('« User stories : » en prose est signalé, pas ignoré en silence', () => {
    const issue = parsed.issues.find((i) => i.sourceKey === 'GOV-03');
    expect(issue?.level).toBe('warning');
    expect(issue?.message).toContain('sans liste numérotée');
  });

  test('le corps d’un epic est conservé verbatim', () => {
    expect(byKey.get('GOV-01')!.body).toContain('modéliser société et filiale');
    expect(byKey.get('GOV-01')!.body).toContain('Tâches principales');
  });

  test('le corps s’arrête au titre suivant', () => {
    expect(byKey.get('GOV-04')!.body).toContain('contexte et options');
    expect(byKey.get('GOV-04')!.body).not.toContain('Development Workspace');
  });

  test('l’empreinte d’extrait change quand le contenu change, pas autrement', () => {
    const again = parseExecutionReference(DOCUMENT);
    expect(again.items.find((i) => i.sourceKey === 'GOV-01')!.sourceExcerptHash).toBe(
      byKey.get('GOV-01')!.sourceExcerptHash,
    );

    const edited = parseExecutionReference(DOCUMENT.replace('historiser les transformations', 'historiser les fusions'));
    expect(edited.items.find((i) => i.sourceKey === 'GOV-01')!.sourceExcerptHash).not.toBe(
      byKey.get('GOV-01')!.sourceExcerptHash,
    );
  });

  test('une clé en double est une erreur — le rapprochement en dépend', () => {
    const doubled = parseExecutionReference(`${DOCUMENT}\n#### EPIC GOV-01 — Doublon\n`);
    const error = doubled.issues.find((i) => i.level === 'error');
    expect(error?.message).toContain('GOV-01');
    expect(doubled.items.filter((i) => i.sourceKey === 'GOV-01')).toHaveLength(1);
  });

  test('un document hors format est refusé plutôt que lu à moitié', () => {
    const parsedEmpty = parseExecutionReference('# Un titre\n\nDu texte sans structure.\n');
    expect(parsedEmpty.items).toHaveLength(0);
    expect(parsedEmpty.issues[0].level).toBe('error');
  });

  test('une capacité mal numérotée est signalée sans bloquer la lecture', () => {
    const odd = parseExecutionReference(
      '# Domaine 1 — Gouvernance\n\n### Capacité 7.1 — Égarée\n\n#### EPIC XXX-01 — Titre\n',
    );
    expect(odd.issues.some((i) => i.level === 'warning' && i.message.includes('D01'))).toBe(true);
    expect(odd.items.find((i) => i.sourceKey === 'D07.C01')?.parentKey).toBe('D07');
  });
});

/**
 * Le format léger : un document qui ne porte qu'un lot de travail.
 *
 * Le référentiel v1.3 déclarait douze domaines, leurs capacités, puis les
 * epics — c'est ce que le parseur savait lire, et il l'exigeait. Écrire « les
 * deux epics de la facturation » demandait alors d'inventer une hiérarchie
 * vide au-dessus, et le domaine devenait obligatoire pour une information
 * qu'on ne veut pas toujours donner à l'écriture.
 */
describe('un document sans domaine', () => {
  const LOT = `# Lot « Facturation par échéance »

# EPIC BIL-01 — Générer les factures avant l'échéance

Priorité : P0
Domaine : D08

Stories :

1. En tant que gestionnaire, je veux voir les factures à venir.
2. En tant que client, je veux recevoir ma facture par courriel.

# EPIC BIL-02 — Annuler une facture émise par erreur

Priorité : P1

Stories :

- En tant que gestionnaire, je veux annuler une facture en donnant un motif.
`;

  test('des epics sans hiérarchie se lisent, sans anomalie', () => {
    const parsed = parseExecutionReference(LOT);
    expect(summarize(parsed)).toEqual({ domain: 0, capability: 0, epic: 2, story: 3 });
    expect(parsed.issues).toEqual([]);
  });

  /** Le niveau du titre venait de la hiérarchie ; sans elle il n'a plus de sens. */
  test('l’epic se déclare à n’importe quel niveau de titre', () => {
    for (const level of ['#', '##', '####', '######']) {
      const parsed = parseExecutionReference(`${level} EPIC ONE-01 — Titre\n`);
      expect(parsed.items.map((i) => i.sourceKey)).toEqual(['ONE-01']);
    }
  });

  /** Aucun éditeur ne distingue les tirets à la frappe. */
  test('le tiret simple vaut le cadratin', () => {
    const parsed = parseExecutionReference('# EPIC ONE-01 - Titre\n');
    expect(parsed.items[0]?.title).toBe('Titre');
  });

  test('« Domaine : D08 » classe l’epic sans réclamer une section absente', () => {
    const parsed = parseExecutionReference(LOT);
    expect(parsed.items.find((i) => i.sourceKey === 'BIL-01')?.parentKey).toBe('D08');
    expect(parsed.issues.filter((i) => i.message.includes('D08'))).toEqual([]);
  });

  /** « Domaine : 8 » et « Domaine : D08 » ne doivent pas être deux clés. */
  test('le numéro nu vaut le code', () => {
    const parsed = parseExecutionReference('# EPIC ONE-01 — Titre\n\nDomaine : 8\n');
    expect(parsed.items[0]?.parentKey).toBe('D08');
  });

  /** Sans domaine déclaré, l'epic reste non classé — et c'est légitime. */
  test('un epic sans domaine n’est pas une anomalie', () => {
    const parsed = parseExecutionReference(LOT);
    expect(parsed.items.find((i) => i.sourceKey === 'BIL-02')?.parentKey).toBeNull();
  });

  test('les puces valent la numérotation, et les clés suivent le rang', () => {
    const parsed = parseExecutionReference(LOT);
    expect(parsed.items.filter((i) => i.parentKey === 'BIL-02').map((i) => i.sourceKey)).toEqual([
      'US-BIL-02-1',
    ]);
  });

  /** Le gras de « **Priorité : P0** » est une convention d'écriture, pas du sens. */
  test('la priorité se lit avec ou sans gras', () => {
    const gras = parseExecutionReference('# EPIC ONE-01 — Titre\n\n**Priorité : P2**\n');
    const nu = parseExecutionReference('# EPIC ONE-01 — Titre\n\nPriorité : P2\n');
    expect(gras.items[0]?.priority).toBe('P2');
    expect(nu.items[0]?.priority).toBe('P2');
  });

  /** Un document vraiment hors format doit toujours être refusé. */
  test('du texte sans epic reste refusé', () => {
    const parsed = parseExecutionReference('# Un titre\n\nDu texte sans structure.\n');
    expect(parsed.issues[0].level).toBe('error');
    expect(parsed.issues[0].message).toContain('EPIC');
  });
});
