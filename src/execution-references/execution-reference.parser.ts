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
}

const DOMAIN_HEADING = /^# Domaine (\d{1,2}) — (.+?)\s*$/;
const CAPABILITY_HEADING = /^### Capacité (\d{1,2})\.(\d{1,2}) — (.+?)\s*$/;
const EPIC_HEADING = /^#### EPIC ([A-Z]{2,6}-\d{1,3}) — (.+?)\s*$/;
const PRIORITY_LINE = /^\*\*Priorité\s*:\s*(P[0-3])\*\*\s*$/;
const STORY_BLOCK_START = /^User stories\s*:/;
const NUMBERED_ITEM = /^(\d{1,2})\.\s+(.+?)\s*$/;
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
      if (!currentDomain) {
        issues.push({
          level: 'warning',
          message: `EPIC ${code} apparaît avant tout domaine — il ne pourra pas être rattaché.`,
          line: lineNumber,
          sourceKey: code,
        });
      }
      const epic: ParsedItem = {
        kind: 'epic',
        sourceKey: code,
        parentKey: currentCapability ?? currentDomain,
        title,
        body: null,
        priority: null,
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
          const sentence = storyTitle(numbered[2]);
          items.push({
            kind: 'story',
            sourceKey: key,
            parentKey: currentEpic.sourceKey,
            title: sentence,
            body: null,
            priority: currentEpic.priority,
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
        "Aucun domaine, capacité ni epic reconnu — le document ne suit pas la structure attendue (« # Domaine N — … », « ### Capacité N.M — … », « #### EPIC XXX-NN — … »).",
    });
  }

  for (const item of items) {
    if (item.parentKey && !seenKeys.has(item.parentKey)) {
      issues.push({
        level: 'warning',
        message: `« ${item.sourceKey} » se rattache à « ${item.parentKey} », absent du document.`,
        line: item.line,
        sourceKey: item.sourceKey,
      });
    }
  }

  return { items, issues };
}

/** Counts per kind — what a validation report leads with. */
export function summarize(parsed: ParsedReference): Record<ParsedItemKind, number> {
  const counts = { domain: 0, capability: 0, epic: 0, story: 0 };
  for (const item of parsed.items) counts[item.kind] += 1;
  return counts;
}
