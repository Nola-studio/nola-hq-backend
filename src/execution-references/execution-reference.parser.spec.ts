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

/**
 * Le projet et le côté — ce qui relie un document au code.
 *
 * Sans le projet, les tickets naissent orphelins et « Start Work » n'a aucun
 * dépôt où ouvrir leur branche. Sans le côté, un projet qui porte un front et
 * un back oblige à poser la question à chaque ticket.
 */
describe('projet et côté', () => {
  const LOT = `# Lot « Facturation »

Projet : NolaHQ

# EPIC BIL-01 — Générer les factures

Côté : backend

Stories :

1. Générer la facture trois jours avant l'échéance.
2. En tant que gestionnaire, je veux voir les factures à venir. #frontend

# EPIC BIL-02 — Annuler une facture

Côté : les deux

Stories :

- Annuler une facture en donnant un motif.
`;

  test('le projet se déclare une fois pour tout le document', () => {
    expect(parseExecutionReference(LOT).project).toBe('NolaHQ');
  });

  test('sans déclaration, le projet est nul — et ce n’est pas une anomalie', () => {
    const parsed = parseExecutionReference('# EPIC ONE-01 — Titre\n');
    expect(parsed.project).toBeNull();
    expect(parsed.issues).toEqual([]);
  });

  /** Deux projets, c'est une contradiction : le premier gagne, et on le dit. */
  test('un second projet est signalé plutôt que d’écraser le premier', () => {
    const parsed = parseExecutionReference('Projet : A\nProjet : B\n\n# EPIC ONE-01 — T\n');
    expect(parsed.project).toBe('A');
    expect(parsed.issues.some((i) => i.message.includes('deux projets'))).toBe(true);
  });

  test('le côté d’un epic descend sur ses stories', () => {
    const items = parseExecutionReference(LOT).items;
    expect(items.find((i) => i.sourceKey === 'BIL-01')?.surface).toBe('backend');
    expect(items.find((i) => i.sourceKey === 'US-BIL-01-1')?.surface).toBe('backend');
  });

  /** Un epic mêle souvent les deux : la story tranche pour elle-même. */
  test('une story marquée #frontend l’emporte sur son epic', () => {
    const story = parseExecutionReference(LOT).items.find((i) => i.sourceKey === 'US-BIL-01-2');
    expect(story?.surface).toBe('frontend');
  });

  test('la marque ne reste pas dans le titre', () => {
    const story = parseExecutionReference(LOT).items.find((i) => i.sourceKey === 'US-BIL-01-2');
    expect(story?.title).toBe('En tant que gestionnaire, je veux voir les factures à venir.');
  });

  test('« les deux » vaut fullstack', () => {
    const epic = parseExecutionReference(LOT).items.find((i) => i.sourceKey === 'BIL-02');
    expect(epic?.surface).toBe('fullstack');
  });

  test('les abréviations courantes sont acceptées', () => {
    for (const [written, expected] of [
      ['back', 'backend'],
      ['api', 'backend'],
      ['front', 'frontend'],
      ['UI', 'frontend'],
      ['fullstack', 'fullstack'],
    ] as const) {
      const parsed = parseExecutionReference(`# EPIC ONE-01 — T\n\nCôté : ${written}\n`);
      expect(parsed.items[0]?.surface).toBe(expected);
    }
  });

  /** Un côté inconnu est signalé : le silence le ferait passer pour absent. */
  test('un côté inconnu est signalé, sans bloquer', () => {
    const parsed = parseExecutionReference('# EPIC ONE-01 — T\n\nCôté : mobile\n');
    expect(parsed.items[0]?.surface).toBeNull();
    expect(parsed.issues[0]?.message).toContain('mobile');
  });

  test('sans côté, l’item n’en a pas — on ne devine pas depuis un titre', () => {
    const parsed = parseExecutionReference('# EPIC ONE-01 — Migrer la base\n');
    expect(parsed.items[0]?.surface).toBeNull();
  });
});

/**
 * « Version cible : 1.4 » — ce qui relie un lot à sa livraison.
 *
 * Le numéro désigne une version du registre (REL-00), pas une section du
 * document : c'est l'import qui le résout, et qui le dit quand il ne désigne
 * rien.
 */
describe('la version cible', () => {
  const LOT = `# EPIC BIL-01 — Générer les factures

Version cible : 1.4.0

Stories :

1. Générer la facture trois jours avant le renouvellement.
2. Envoyer la facture au contact de facturation.
`;

  test('elle se lit sous l’epic', () => {
    const epic = parseExecutionReference(LOT).items.find((i) => i.sourceKey === 'BIL-01');
    expect(epic?.targetVersion).toBe('1.4.0');
  });

  /** On ne livre pas la moitié d'un epic : ses stories partent avec lui. */
  test('elle descend sur les stories de l’epic', () => {
    const stories = parseExecutionReference(LOT).items.filter((i) => i.kind === 'story');
    expect(stories).toHaveLength(2);
    for (const story of stories) expect(story.targetVersion).toBe('1.4.0');
  });

  /** « v1.4 » et « 1.4 » désignent la même chose — le v est une habitude. */
  test('le « v » optionnel ne crée pas un second numéro', () => {
    const parsed = parseExecutionReference('# EPIC ONE-01 — T\n\nVersion cible : v1.4.0\n');
    expect(parsed.items[0]?.targetVersion).toBe('1.4.0');
  });

  test('sans la ligne, l’epic ne vise rien — et ce n’est pas une anomalie', () => {
    const parsed = parseExecutionReference('# EPIC ONE-01 — Titre\n');
    expect(parsed.items[0]?.targetVersion).toBeNull();
    expect(parsed.issues).toEqual([]);
  });

  /**
   * Les référentiels par domaine écrivent le numéro suivi du nom de la
   * version — « Version cible : 1.11 — Contrôle et gouvernance avancée ».
   * Seul le numéro désigne quelque chose : le libellé est un repère de
   * lecture pour l'humain. Le garder empêcherait l'import de résoudre la
   * version, et ferait déborder `target_version`, taillé comme le numéro
   * qu'il reflète.
   */
  test('le libellé qui suit le numéro n’en fait pas partie', () => {
    const parsed = parseExecutionReference(
      '# EPIC GOV-02 — T\n\nVersion cible : 1.11 — Contrôle et gouvernance avancée\n',
    );
    expect(parsed.items[0]?.targetVersion).toBe('1.11');
  });

  /**
   * Le registre n'impose pas le versionnage sémantique : d'autres produits du
   * groupe numérotent par date. Un tiret sans espaces appartient au numéro et
   * n'ouvre pas un libellé.
   */
  test('un numéro daté garde ses tirets', () => {
    const parsed = parseExecutionReference('# EPIC ONE-01 — T\n\nVersion cible : 2026-09-05\n');
    expect(parsed.items[0]?.targetVersion).toBe('2026-09-05');
  });

  /**
   * Le registre borne un numéro de version à 32 caractères. Au-delà, ce n'est
   * plus un numéro : le parser le dit et l'epic n'en vise aucun, plutôt que de
   * laisser l'écriture du manifeste échouer sur la contrainte de la colonne.
   */
  test('un numéro trop long est une anomalie, pas une panne', () => {
    const parsed = parseExecutionReference(
      '# EPIC ONE-01 — T\n\nVersion cible : 1.11 Contrôle et gouvernance avancée du groupe\n',
    );
    expect(parsed.items[0]?.targetVersion).toBeNull();
    expect(parsed.issues).toEqual([
      {
        level: 'warning',
        message:
          '« 1.11 Contrôle et gouvernance avancée du groupe » ne peut pas être un numéro de version — 32 caractères au plus. L’epic entre sans version.',
        line: 3,
        sourceKey: 'ONE-01',
      },
    ]);
  });

  test('elle cohabite avec le côté et le domaine', () => {
    const parsed = parseExecutionReference(
      '# EPIC ONE-01 — T\n\nDomaine : D08\nCôté : backend\nVersion cible : 1.4.0\n',
    );
    const epic = parsed.items[0];
    expect(epic?.targetVersion).toBe('1.4.0');
    expect(epic?.surface).toBe('backend');
    expect(epic?.parentKey).toBe('D08');
  });
});

/**
 * Le titre d'un ticket est borné à 200 caractères ; le manifeste en accepte
 * 300. Un titre entre les deux passait l'analyse pour faire échouer l'import,
 * loin de la ligne fautive. Le parser borne donc, et le rapport nomme le
 * document qui a débordé.
 */
describe('un titre trop long', () => {
  const LONG = 'x'.repeat(250);

  test('celui d’un epic est borné, et l’anomalie le nomme', () => {
    const parsed = parseExecutionReference(`# EPIC ONE-01 — ${LONG}\n`);
    expect([...(parsed.items[0]?.title ?? '')].length).toBe(198);
    expect(parsed.items[0]?.title.endsWith('…')).toBe(true);
    expect(parsed.issues).toEqual([
      {
        level: 'warning',
        message:
          'Titre de 250 caractères pour ONE-01 — 200 au plus, il a été coupé. Raccourcissez-le dans le document.',
        line: 1,
        sourceKey: 'ONE-01',
      },
    ]);
  });

  test('celui d’une story aussi — la coupe cesse d’être silencieuse', () => {
    const parsed = parseExecutionReference(
      `# EPIC ONE-01 — T\n\nStories :\n\n1. ${LONG}\n`,
    );
    const story = parsed.items.find((i) => i.kind === 'story');
    expect([...(story?.title ?? '')].length).toBe(198);
    expect(parsed.issues).toHaveLength(1);
    expect(parsed.issues[0]?.sourceKey).toBe('US-ONE-01-1');
  });

  /**
   * L'empreinte porte sur la phrase entière, pas sur ce qu'il en reste après
   * la coupe. Avant, deux stories ne différant qu'au-delà du 200e caractère
   * avaient la même empreinte : la correction du texte long passait pour
   * « inchangée » au ré-import, et le ticket gardait l'ancienne version.
   */
  test('une correction au-delà de la coupe reste détectable', () => {
    const empreinte = (fin: string) =>
      parseExecutionReference(`# EPIC ONE-01 — T\n\nStories :\n\n1. ${'a'.repeat(210)}${fin}\n`)
        .items.find((i) => i.kind === 'story')?.sourceExcerptHash;
    expect(empreinte('ROUGE')).not.toBe(empreinte('VERT'));
  });

  test('un titre de 200 caractères passe sans un mot', () => {
    const parsed = parseExecutionReference(`# EPIC ONE-01 — ${'y'.repeat(200)}\n`);
    expect([...(parsed.items[0]?.title ?? '')].length).toBe(200);
    expect(parsed.issues).toEqual([]);
  });
});

/**
 * La story déclarée en section, avec sa clé écrite.
 *
 * La liste numérotée dérive la clé du rang — ce que le parser s'interdit trois
 * lignes plus haut dans son propre commentaire. Insérer une story y décale
 * toutes les suivantes, et le rapprochement par `sourceKey` donne au ticket de
 * la troisième le texte de la quatrième. La clé écrite supprime la classe.
 */
describe('la story en section', () => {
  const DOC = `# EPIC GOV-01 — Registre canonique

Priorité : P0
Côté : backend
Version cible : 0.3

##### US-GOV-01-1 — Consulter la structure du groupe

En tant que dirigeant, je veux consulter la structure complète du groupe
afin de comprendre les liens entre la mère et ses filiales.

##### US-GOV-01-2 — Enregistrer les données légales

En tant que juriste, je veux enregistrer les données légales d'une entité.
`;

  test('la clé vient du document, pas du rang', () => {
    const stories = parseExecutionReference(DOC).items.filter((i) => i.kind === 'story');
    expect(stories.map((s) => s.sourceKey)).toEqual(['US-GOV-01-1', 'US-GOV-01-2']);
    expect(stories[0]?.title).toBe('Consulter la structure du groupe');
  });

  /** Le cœur du correctif : l'ordre du document cesse de porter du sens. */
  test('réordonner les sections ne déplace aucune clé', () => {
    const [a, b] = DOC.split('##### ').slice(1);
    const inverse = `${DOC.split('##### ')[0]}##### ${b.trimEnd()}\n\n##### ${a.trimEnd()}\n`;
    const cles = (doc: string) =>
      Object.fromEntries(
        parseExecutionReference(doc)
          .items.filter((i) => i.kind === 'story')
          .map((s) => [s.title, s.sourceKey]),
      );
    expect(Object.keys(cles(DOC))).toHaveLength(2);
    expect(cles(inverse)).toEqual(cles(DOC));
  });

  test('elle hérite de la priorité, du côté et de la version de son epic', () => {
    const story = parseExecutionReference(DOC).items.find((i) => i.kind === 'story');
    expect(story?.parentKey).toBe('GOV-01');
    expect(story?.priority).toBe('P0');
    expect(story?.surface).toBe('backend');
    expect(story?.targetVersion).toBe('0.3');
  });

  /** « Côté : » écrit dans la section parle pour la story — pas pour l'epic,
   *  dont il changerait alors le côté de toutes les stories suivantes. */
  test('« Côté : » dans la section ne déteint pas sur l’epic', () => {
    const parsed = parseExecutionReference(
      '# EPIC GOV-01 — T\n\nCôté : backend\n\n##### US-GOV-01-1 — Une vue\n\nCôté : frontend\n\n##### US-GOV-01-2 — Autre chose\n\nDu texte.\n',
    );
    const [epic, un, deux] = [
      parsed.items.find((i) => i.kind === 'epic'),
      ...parsed.items.filter((i) => i.kind === 'story'),
    ];
    expect(un?.surface).toBe('frontend');
    expect(deux?.surface).toBe('backend');
    expect(epic?.surface).toBe('backend');
  });

  test('un côté inconnu dans la section nomme la story, pas l’epic', () => {
    const parsed = parseExecutionReference(
      '# EPIC GOV-01 — T\n\n##### US-GOV-01-1 — Une vue\n\nCôté : mobile\n',
    );
    expect(parsed.issues[0]?.sourceKey).toBe('US-GOV-01-1');
  });

  /**
   * La version se déclare sur l'epic — on ne livre pas la moitié d'un epic.
   * Écrite dans une section de story, elle changeait silencieusement celle de
   * l'epic, donc celle de toutes les stories suivantes.
   */
  test('« Version cible : » dans une section est refusée, pas appliquée', () => {
    const parsed = parseExecutionReference(
      '# EPIC GOV-01 — T\n\nVersion cible : 0.3\n\n##### US-GOV-01-1 — Une vue\n\nVersion cible : 9.9\n\n##### US-GOV-01-2 — Autre\n\nTexte.\n',
    );
    const epic = parsed.items.find((i) => i.kind === 'epic');
    expect(epic?.targetVersion).toBe('0.3');
    for (const story of parsed.items.filter((i) => i.kind === 'story'))
      expect(story.targetVersion).toBe('0.3');
    expect(parsed.issues).toHaveLength(1);
    expect(parsed.issues[0]?.level).toBe('warning');
    expect(parsed.issues[0]?.sourceKey).toBe('US-GOV-01-1');
  });

  /**
   * Ce qui appartient à l'item lui-même — le côté, la priorité — s'écrit dans
   * sa section et ne vaut que pour lui. Écrit sur l'epic, il aurait changé
   * l'epic et toutes les stories suivantes, sans un mot.
   */
  test('« Priorité : » dans la section vaut pour la story seule', () => {
    const parsed = parseExecutionReference(
      '# EPIC GOV-01 — T\n\nPriorité : P0\n\n##### US-GOV-01-1 — Une vue\n\nPriorité : P3\n\n##### US-GOV-01-2 — Autre\n\nTexte.\n',
    );
    const epic = parsed.items.find((i) => i.kind === 'epic');
    const [un, deux] = parsed.items.filter((i) => i.kind === 'story');
    expect(un?.priority).toBe('P3');
    expect(deux?.priority).toBe('P0');
    expect(epic?.priority).toBe('P0');
  });

  /**
   * Le domaine classe l'epic, et la story suit son epic : une story rangée
   * ailleurs que son parent serait incohérente avec la chaîne elle-même.
   */
  test('« Domaine : » dans la section est refusé, pas appliqué', () => {
    const parsed = parseExecutionReference(
      '# EPIC GOV-01 — T\n\nDomaine : D01\n\n##### US-GOV-01-1 — Une vue\n\nDomaine : D09\n',
    );
    const epic = parsed.items.find((i) => i.kind === 'epic');
    expect(epic?.parentKey).toBe('D01');
    expect(parsed.items.find((i) => i.kind === 'story')?.parentKey).toBe('GOV-01');
    expect(parsed.issues).toHaveLength(1);
    expect(parsed.issues[0]?.level).toBe('warning');
    expect(parsed.issues[0]?.sourceKey).toBe('US-GOV-01-1');
  });

  /**
   * Le filet, plutôt qu'un audit à l'œil : toutes les lignes de métadonnées
   * écrites dans une section de story, et un epic qui n'a pas bougé d'un
   * champ. Une ligne qu'on ajouterait plus tard sans la garder tomberait ici.
   */
  test('aucune ligne écrite dans une section ne déteint sur l’epic', () => {
    const temoin = parseExecutionReference(
      '# EPIC GOV-01 — T\n\nPriorité : P0\nCôté : backend\nDomaine : D01\nVersion cible : 0.3\n\n##### US-GOV-01-1 — Une vue\n\nTexte.\n',
    ).items.find((i) => i.kind === 'epic');

    const pollue = parseExecutionReference(
      '# EPIC GOV-01 — T\n\nPriorité : P0\nCôté : backend\nDomaine : D01\nVersion cible : 0.3\n\n##### US-GOV-01-1 — Une vue\n\nPriorité : P3\nCôté : frontend\nDomaine : D09\nVersion cible : 9.9\n',
    ).items.find((i) => i.kind === 'epic');

    expect(pollue).toEqual(temoin!);
  });

  test('le corps de la section devient celui de la story', () => {
    const story = parseExecutionReference(DOC).items.find((i) => i.kind === 'story');
    expect(story?.body).toContain('En tant que dirigeant');
  });

  /** Les onze documents non convertis doivent continuer d'être lus. */
  test('les deux formats cohabitent dans un même document', () => {
    const parsed = parseExecutionReference(
      '# EPIC ONE-01 — T\n\nStories :\n\n1. Première story numérotée.\n\n# EPIC TWO-02 — T\n\n##### US-TWO-02-1 — En section\n\nDu texte.\n',
    );
    expect(parsed.items.filter((i) => i.kind === 'story').map((s) => s.sourceKey)).toEqual([
      'US-ONE-01-1',
      'US-TWO-02-1',
    ]);
    expect(parsed.issues).toEqual([]);
  });

  test('une clé de section déjà prise est une erreur', () => {
    const parsed = parseExecutionReference(
      '# EPIC ONE-01 — T\n\n##### US-ONE-01-1 — Une\n\nTexte.\n\n##### US-ONE-01-1 — Deux\n\nTexte.\n',
    );
    expect(parsed.issues.some((i) => i.level === 'error')).toBe(true);
    expect(parsed.items.filter((i) => i.kind === 'story')).toHaveLength(1);
  });
});
