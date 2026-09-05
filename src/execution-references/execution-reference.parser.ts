import { createHash } from 'node:crypto';

/**
 * Reads a Nolaa HQ execution reference (Markdown) and extracts the taxonomy it
 * declares — nothing more (EXE-03).
 *
 * Pure: no Nest, no database, no I/O. Same split as `work-items.board.ts` and
 * `momo.summary.ts`, and the reason is the same — the interesting logic is the
 * reading, and it should be testable against a real document without a running
 * application.
 *
 * The parser never creates operational objects and never guesses. What it
 * cannot read, it reports as an issue: a reference that half-parses silently
 * is worse than one that refuses, because the gaps only surface later as
 * missing backlog.
 */

export const PARSED_ITEM_KINDS = ['domain', 'capability', 'epic', 'story'] as const;
export type ParsedItemKind = (typeof PARSED_ITEM_KINDS)[number];

export type ParsedPriority = 'P0' | 'P1' | 'P2' | 'P3';

/**
 * De quel côté du produit la tâche tombe.
 *
 * C'est une information de rédaction, pas de dépôt : le document dit
 * « backend », il ne nomme pas `nola-hq-backend`. Le rapprochement entre un
 * côté et un dépôt se règle une fois dans HQ, sur l'écran des dépôts — sans
 * quoi chaque document devrait connaître l'organisation du code, et vieillirait
 * au premier renommage.
 */
export const PARSED_SURFACES = ['backend', 'frontend', 'fullstack'] as const;
export type ParsedSurface = (typeof PARSED_SURFACES)[number];

/** Ce qu'on écrit vraiment quand on écrit vite. */
const SURFACE_WORDS: Record<string, ParsedSurface> = {
  backend: 'backend',
  back: 'backend',
  api: 'backend',
  serveur: 'backend',
  frontend: 'frontend',
  front: 'frontend',
  ui: 'frontend',
  interface: 'frontend',
  fullstack: 'fullstack',
  full: 'fullstack',
  'les deux': 'fullstack',
  deux: 'fullstack',
  both: 'fullstack',
};

function readSurface(word: string): ParsedSurface | null {
  return SURFACE_WORDS[word.trim().toLowerCase()] ?? null;
}

export interface ParsedItem {
  kind: ParsedItemKind;
  /**
   * Stable key inside the document — `D06`, `D06.C03`, `EXE-05`,
   * `US-GOV-01-1`. This is what reconciles one version against the next
   * (EXE-06), so it must come from the document's own numbering, never from a
   * position or a title.
   */
  sourceKey: string;
  parentKey: string | null;
  title: string;
  /** The section's prose, verbatim: tasks, acceptance criteria, notes. */
  body: string | null;
  priority: ParsedPriority | null;
  /** Backend, frontend, les deux — ou rien, quand le rédacteur ne l'a pas dit. */
  surface: ParsedSurface | null;
  /** Le numéro de version visé, tel qu'écrit — résolu à l'import. */
  targetVersion: string | null;
  /** Slug of the heading — survives a re-ordering, unlike a line number. */
  sourceSectionId: string;
  /** SHA-256 of the raw slice, so a later version can tell what actually changed. */
  sourceExcerptHash: string;
  /** 1-based, informational: helps a human find the section, never used to reconcile. */
  line: number;
}

export interface ParseIssue {
  level: 'error' | 'warning';
  message: string;
  line?: number;
  sourceKey?: string;
}

export interface ParsedReference {
  items: ParsedItem[];
  issues: ParseIssue[];
  /**
   * Le projet que le document sert, tel qu'écrit — « NolaHQ », « HQ ». C'est
   * l'import qui le résout contre le registre des projets, parce que lui seul
   * sait ce qui existe ; le parseur ne devine rien.
   */
  project: string | null;
}

const DOMAIN_HEADING = /^# Domaine (\d{1,2}) — (.+?)\s*$/;
const CAPABILITY_HEADING = /^### Capacité (\d{1,2})\.(\d{1,2}) — (.+?)\s*$/;
/**
 * Le niveau de titre ne porte pas de sens ici : `####` venait de la hiérarchie
 * du référentiel v1.3, où l'epic vivait sous un domaine et une capacité. Un
 * document qui n'a que des epics commence naturellement au `#`, et le lui
 * refuser reviendrait à imposer une hiérarchie vide.
 *
 * Le tiret cadratin reste la forme canonique ; le demi-cadratin et le trait
 * d'union sont acceptés parce qu'aucun éditeur ne les distingue à la frappe.
 */
const EPIC_HEADING = /^#{1,6}\s+EPIC\s+([A-Z]{2,6}-\d{1,3})\s*[—–-]\s*(.+?)\s*$/;
/** Les astérisques du gras sont facultatives : elles ne changent pas le sens. */
const PRIORITY_LINE = /^\*{0,2}Priorité\s*:\s*\*{0,2}(P[0-3])\*{0,2}\s*$/;
/**
 * Rattachement explicite d'un epic à un domaine, pour un document qui n'a pas
 * la hiérarchie complète : « Domaine : D06 » (ou « Domaine : 6 »). Facultatif —
 * un epic sans domaine s'importe non classé, et se classe dans HQ.
 */
const DOMAIN_LINE = /^\*{0,2}Domaine\s*:\s*\*{0,2}\s*D?(\d{1,2})\*{0,2}\s*$/i;
/**
 * Le projet que le document sert, déclaré une fois en tête : « Projet : NolaHQ ».
 * Sans lui, les tickets naissent sans projet — et « Start Work » n'a alors
 * aucun dépôt où ouvrir leur branche.
 */
const PROJECT_LINE = /^\*{0,2}Projet\s*:\s*\*{0,2}\s*(.+?)\*{0,2}\s*$/i;
/**
 * « Version cible : 1.4 » sous un epic.
 *
 * Le numéro désigne une version du registre (REL-00), pas une section du
 * document : c'est l'import qui le résout. Facultatif — un lot qu'on dépose
 * avant d'avoir planifié sa livraison est le cas courant.
 */
const TARGET_VERSION_LINE = /^\*{0,2}Version cible\s*:\s*\*{0,2}\s*v?(.+?)\*{0,2}\s*$/i;
/** « Côté : backend » sous un epic, hérité par ses stories. */
const SURFACE_LINE = /^\*{0,2}(?:C[oô]t[ée]|Surface)\s*:\s*\*{0,2}\s*(.+?)\*{0,2}\s*$/i;
/** « … #backend » en fin de ligne d'une story, quand un epic mêle les deux. */
const SURFACE_TAG = /\s+#(backend|back|api|serveur|frontend|front|ui|interface|fullstack|full|both)\s*$/i;
const STORY_BLOCK_START = /^\*{0,2}(?:User )?[Ss]tories\s*:/;
/** Numérotée ou à puces : la clé vient du rang, pas de la puce. */
const NUMBERED_ITEM = /^(?:\d{1,2}\.|[-*])\s+(.+?)\s*$/;
const ANY_HEADING = /^#{1,6}\s/;

/** `D6` and `D06` must never be two different keys. */
function domainKey(n: string): string {
  return `D${n.padStart(2, '0')}`;
}

function capabilityKey(domain: string, capability: string): string {
  return `${domainKey(domain)}.C${capability.padStart(2, '0')}`;
}

function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Splits a story sentence into its user-story shape when it has one. A
 * referential writes « En tant que X, je veux Y afin de Z » — the persona is
 * worth keeping as the title's prefix so a backlog row reads like a story and
 * not like a paragraph.
 */
function storyTitle(sentence: string): string {
  const trimmed = sentence.replace(/\s+/g, ' ').trim();
  return trimmed.length <= 200 ? trimmed : `${trimmed.slice(0, 197)}…`;
}

export function parseExecutionReference(markdown: string): ParsedReference {
  const lines = markdown.split(/\r?\n/);
  const items: ParsedItem[] = [];
  const issues: ParseIssue[] = [];

  /** Where each open section started, so its body can be closed off later. */
  let currentDomain: string | null = null;
  let currentCapability: string | null = null;
  let currentEpic: ParsedItem | null = null;
  let openItem: { item: ParsedItem; bodyStart: number } | null = null;

  const seenKeys = new Map<string, number>();
  /** Codes cités par une ligne « Domaine : … » — ils vivent dans le registre,
   *  pas dans le document : ne pas les réclamer comme sections manquantes. */
  const declaredDomainCodes = new Set<string>();
  let project: string | null = null;

  function closeOpenItem(endLine: number) {
    if (!openItem) return;
    const raw = lines.slice(openItem.bodyStart, endLine).join('\n').trim();
    openItem.item.body = raw.length > 0 ? raw : null;
    openItem.item.sourceExcerptHash = sha256(
      `${openItem.item.title}\n${openItem.item.body ?? ''}`,
    );
    openItem = null;
  }

  function push(item: ParsedItem, bodyStart: number | null) {
    const previous = seenKeys.get(item.sourceKey);
    if (previous !== undefined) {
      issues.push({
        level: 'error',
        message: `Clé « ${item.sourceKey} » déjà déclarée ligne ${previous} — les clés doivent être uniques pour permettre le rapprochement entre versions.`,
        line: item.line,
        sourceKey: item.sourceKey,
      });
      return;
    }
    seenKeys.set(item.sourceKey, item.line);
    items.push(item);
    if (bodyStart !== null) openItem = { item, bodyStart };
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineNumber = i + 1;

    const domainMatch = DOMAIN_HEADING.exec(line);
    if (domainMatch) {
      closeOpenItem(i);
      const [, number, title] = domainMatch;
      currentDomain = domainKey(number);
      currentCapability = null;
      currentEpic = null;
      push(
        {
          kind: 'domain',
          sourceKey: currentDomain,
          parentKey: null,
          title,
          body: null,
          priority: null,
          surface: null,
          targetVersion: null,
          sourceSectionId: slug(`domaine-${number}-${title}`),
          sourceExcerptHash: sha256(title),
          line: lineNumber,
        },
        null,
      );
      continue;
    }

    const capabilityMatch = CAPABILITY_HEADING.exec(line);
    if (capabilityMatch) {
      closeOpenItem(i);
      const [, domainNumber, capabilityNumber, title] = capabilityMatch;
      const key = capabilityKey(domainNumber, capabilityNumber);
      const parent = domainKey(domainNumber);

      // The capability's own number says which domain it belongs to, so the
      // parse does not depend on document order. A mismatch with the enclosing
      // domain is still worth flagging — it usually means a mis-numbered
      // section rather than a deliberate cross-reference.
      if (currentDomain && currentDomain !== parent) {
        issues.push({
          level: 'warning',
          message: `« Capacité ${domainNumber}.${capabilityNumber} » apparaît sous ${currentDomain} — rattachée à ${parent}, d'après son propre numéro.`,
          line: lineNumber,
          sourceKey: key,
        });
      }

      currentCapability = key;
      currentEpic = null;
      push(
        {
          kind: 'capability',
          sourceKey: key,
          parentKey: parent,
          title,
          body: null,
          priority: null,
          surface: null,
          targetVersion: null,
          sourceSectionId: slug(`capacite-${domainNumber}-${capabilityNumber}-${title}`),
          sourceExcerptHash: sha256(title),
          line: lineNumber,
        },
        null,
      );
      continue;
    }

    const epicMatch = EPIC_HEADING.exec(line);
    if (epicMatch) {
      closeOpenItem(i);
      const [, code, title] = epicMatch;
      const epic: ParsedItem = {
        kind: 'epic',
        sourceKey: code,
        parentKey: currentCapability ?? currentDomain,
        title,
        body: null,
        priority: null,
        surface: null,
        targetVersion: null,
        sourceSectionId: slug(`epic-${code}-${title}`),
        sourceExcerptHash: '',
        line: lineNumber,
      };
      currentEpic = epic;
      push(epic, i + 1);
      continue;
    }

    // A priority line belongs to the epic it follows.
    const priorityMatch = PRIORITY_LINE.exec(line);
    if (priorityMatch && currentEpic) {
      currentEpic.priority = priorityMatch[1] as ParsedPriority;
      continue;
    }

    /**
     * « Domaine : D06 » sous un epic le classe sans qu'il faille écrire toute
     * la hiérarchie. Le code désigne un domaine du registre, pas une section
     * du document : c'est l'import qui le résout.
     */
    /**
     * Le projet vaut pour tout le document : il se déclare une fois, en tête.
     * Une seconde déclaration serait une contradiction — on garde la première
     * et on le signale, plutôt que de laisser la dernière ligne l'emporter en
     * silence.
     */
    const projectMatch = PROJECT_LINE.exec(line);
    if (projectMatch) {
      const declared = projectMatch[1].trim();
      if (project === null) {
        project = declared;
      } else if (project !== declared) {
        issues.push({
          level: 'warning',
          message: `Le document déclare deux projets — « ${project} » puis « ${declared} ». Le premier est retenu.`,
          line: lineNumber,
        });
      }
      continue;
    }

    const surfaceMatch = SURFACE_LINE.exec(line);
    if (surfaceMatch && currentEpic) {
      const surface = readSurface(surfaceMatch[1]);
      if (surface) {
        currentEpic.surface = surface;
      } else {
        issues.push({
          level: 'warning',
          message: `« ${surfaceMatch[1].trim()} » n'est pas un côté connu — attendu backend, frontend ou les deux.`,
          line: lineNumber,
          sourceKey: currentEpic.sourceKey,
        });
      }
      continue;
    }

    const targetVersionMatch = TARGET_VERSION_LINE.exec(line);
    if (targetVersionMatch && currentEpic) {
      currentEpic.targetVersion = targetVersionMatch[1].trim() || null;
      continue;
    }

    const domainLineMatch = DOMAIN_LINE.exec(line);
    if (domainLineMatch && currentEpic) {
      currentEpic.parentKey = domainKey(domainLineMatch[1]);
      declaredDomainCodes.add(currentEpic.parentKey);
      continue;
    }

    // « User stories : » followed by a numbered list, until the list stops.
    if (STORY_BLOCK_START.test(line) && currentEpic) {
      let cursor = i + 1;
      let index = 0;
      while (cursor < lines.length) {
        const candidate = lines[cursor];
        if (ANY_HEADING.test(candidate)) break;
        const numbered = NUMBERED_ITEM.exec(candidate);
        if (numbered) {
          index += 1;
          const key = `US-${currentEpic.sourceKey}-${index}`;
          // Un epic peut mêler les deux côtés : la story le dit pour elle-même,
          // et à défaut hérite de celui de son epic.
          const tagged = SURFACE_TAG.exec(numbered[1]);
          const sentence = storyTitle(tagged ? numbered[1].slice(0, tagged.index) : numbered[1]);
          items.push({
            kind: 'story',
            sourceKey: key,
            parentKey: currentEpic.sourceKey,
            title: sentence,
            body: null,
            priority: currentEpic.priority,
            surface: (tagged && readSurface(tagged[1])) || currentEpic.surface,
            // Une story part avec son epic : on ne livre pas la moitié d'un
            // epic, et la cascade côté HQ dit la même chose.
            targetVersion: currentEpic.targetVersion,
            sourceSectionId: `${currentEpic.sourceSectionId}-us-${index}`,
            sourceExcerptHash: sha256(sentence),
            line: cursor + 1,
          });
          seenKeys.set(key, cursor + 1);
        } else if (candidate.trim() !== '' && index > 0) {
          // Prose after the list ends the block; blank lines inside it do not.
          break;
        }
        cursor += 1;
      }
      if (index === 0) {
        issues.push({
          level: 'warning',
          message: `« User stories : » sans liste numérotée sous EPIC ${currentEpic.sourceKey}.`,
          line: lineNumber,
          sourceKey: currentEpic.sourceKey,
        });
      }
      continue;
    }

    // Any other heading closes the section currently collecting a body.
    if (ANY_HEADING.test(line)) {
      closeOpenItem(i);
      currentEpic = null;
    }
  }

  closeOpenItem(lines.length);

  if (items.length === 0) {
    issues.push({
      level: 'error',
      message:
        "Aucun epic reconnu — un document doit déclarer au moins « # EPIC XXX-NN — Titre ». La hiérarchie complète (« # Domaine N — … », « ### Capacité N.M — … ») reste possible, mais n'est pas obligatoire.",
    });
  }

  for (const item of items) {
    if (item.parentKey && !seenKeys.has(item.parentKey) && !declaredDomainCodes.has(item.parentKey)) {
      issues.push({
        level: 'warning',
        message: `« ${item.sourceKey} » se rattache à « ${item.parentKey} », absent du document.`,
        line: item.line,
        sourceKey: item.sourceKey,
      });
    }
  }

  return { items, issues, project };
}

/** Counts per kind — what a validation report leads with. */
export function summarize(parsed: ParsedReference): Record<ParsedItemKind, number> {
  const counts = { domain: 0, capability: 0, epic: 0, story: 0 };
  for (const item of parsed.items) counts[item.kind] += 1;
  return counts;
}
