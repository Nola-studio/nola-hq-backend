import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ExecutionReferencesService } from './execution-references.service';
import {
  ExecutionManifest,
  ExecutionManifestItem,
  MANIFEST_SCHEMA_VERSION,
} from './execution-manifest.entity';
import { parseExecutionReference, summarize } from './execution-reference.parser';
import { Capability, Domain } from '../domains/domain.entity';
import { WorkItem } from '../work-items/work-item.entity';

/** What one manifest item became when imported. */
export type ImportOutcome = 'created' | 'updated' | 'unchanged' | 'skipped' | 'conflict';

export interface ImportedItem {
  sourceKey: string;
  kind: string;
  outcome: ImportOutcome;
  workItemId?: number;
  reason?: string;
}

export interface ImportReport {
  reference: string;
  version: string;
  dryRun: boolean;
  counts: Record<ImportOutcome, number>;
  items: ImportedItem[];
}

/**
 * Turns a parsed reference into backlog, in the right place (EXE-03 → EXE-05).
 *
 * Two rules shape everything here.
 *
 * **Domains and capabilities are resolved, never created.** They are seeded
 * from the referential and own their codes; an import matches `D06` and
 * `D06.C03` against existing rows so an epic lands on its real domain and
 * capability. A code the registry does not know is *skipped and reported* —
 * inventing a domain to make an import succeed would defeat the purpose of
 * having a canonical set.
 *
 * **Delivered work is never silently rewritten.** Re-importing matches on
 * `sourceKey` and refreshes an item only while it is still untouched in
 * `triage`. Once someone has accepted it and moved it along, a changed
 * document produces a `conflict` line for a human to arbitrate, not an
 * overwrite (EXE-06).
 */
@Injectable()
export class ExecutionImportService {
  constructor(
    @InjectRepository(ExecutionManifest)
    private readonly manifests: Repository<ExecutionManifest>,
    @InjectRepository(ExecutionManifestItem)
    private readonly manifestItems: Repository<ExecutionManifestItem>,
    @InjectRepository(Domain) private readonly domains: Repository<Domain>,
    @InjectRepository(Capability) private readonly capabilities: Repository<Capability>,
    @InjectRepository(WorkItem) private readonly workItems: Repository<WorkItem>,
    private readonly references: ExecutionReferencesService,
  ) {}

  /**
   * Reads a stored version and records what it declares. Writes nothing
   * operational — EXE-03 is explicit that extraction must not create final
   * objects.
   */
  async parse(key: string, version: string, actorEmail: string) {
    const row = await this.references.findVersion(key, version);
    const parsed = parseExecutionReference(row.content);

    // A manifest is derived data: re-parsing replaces it rather than
    // accumulating revisions of a reading of an immutable document.
    const existing = await this.manifests.findOne({ where: { versionId: row.id } });
    if (existing) {
      await this.manifestItems.delete({ manifestId: existing.id });
      await this.manifests.delete({ id: existing.id });
    }

    const manifest = await this.manifests.save(
      this.manifests.create({
        versionId: row.id,
        schemaVersion: MANIFEST_SCHEMA_VERSION,
        issues: parsed.issues,
        parsedBy: actorEmail,
        parsedAt: new Date(),
      }),
    );

    await this.manifestItems.save(
      parsed.items.map((item) =>
        this.manifestItems.create({
          manifestId: manifest.id,
          kind: item.kind,
          sourceKey: item.sourceKey,
          parentKey: item.parentKey,
          title: item.title,
          body: item.body,
          priority: item.priority,
          sourceSectionId: item.sourceSectionId,
          sourceExcerptHash: item.sourceExcerptHash,
          sourceLine: item.line,
        }),
      ),
    );

    return {
      manifestId: manifest.id,
      schemaVersion: manifest.schemaVersion,
      counts: summarize(parsed),
      issues: parsed.issues,
    };
  }

  async findManifest(key: string, version: string) {
    const row = await this.references.findVersion(key, version);
    const manifest = await this.manifests.findOne({
      where: { versionId: row.id },
      relations: ['items'],
    });
    if (!manifest) {
      throw new NotFoundException(
        `Version ${version} de ${key} pas encore analysée — appelez d'abord /parse.`,
      );
    }
    return manifest;
  }

  /**
   * Creates the backlog the manifest proposes. `dryRun` runs the whole
   * resolution and reports what *would* happen without writing — the
   * preview EXE-05 asks for, on the same code path as the real import so the
   * two can never disagree.
   */
  async import(
    key: string,
    version: string,
    actorEmail: string,
    dryRun: boolean,
  ): Promise<ImportReport> {
    const reference = await this.references.findByKey(key);
    const versionRow = await this.references.findVersion(key, version);
    const manifest = await this.findManifest(key, version);
    const items = manifest.items ?? [];

    const domainByCode = new Map((await this.domains.find()).map((d) => [d.code as string, d]));
    const capabilityByCode = new Map((await this.capabilities.find()).map((c) => [c.code, c]));

    const importable = items.filter((item) => item.kind === 'epic' || item.kind === 'story');
    const existing = new Map(
      (
        await this.workItems.find({
          where: { sourceKind: 'manifest', sourceKey: In(importable.map((i) => i.sourceKey)) },
        })
      ).map((w) => [w.sourceKey as string, w]),
    );

    const report: ImportReport = {
      reference: reference.key,
      version: versionRow.version,
      dryRun,
      counts: { created: 0, updated: 0, unchanged: 0, skipped: 0, conflict: 0 },
      items: [],
    };

    /** Epic `sourceKey` → work item id, so stories can hang off their epic. */
    const epicWorkItemId = new Map<string, number>();
    const manifestByKey = new Map(items.map((i) => [i.sourceKey, i]));

    // Epics first: a story's parent must exist before the story is written.
    for (const item of [...importable].sort((a, b) => (a.kind === 'epic' ? -1 : 1) - (b.kind === 'epic' ? -1 : 1))) {
      const placement = resolvePlacement(item, manifestByKey, domainByCode, capabilityByCode);
      if (!placement.ok) {
        report.counts.skipped += 1;
        report.items.push({ sourceKey: item.sourceKey, kind: item.kind, outcome: 'skipped', reason: placement.reason });
        continue;
      }

      const parentWorkItemId =
        item.kind === 'story' && item.parentKey ? epicWorkItemId.get(item.parentKey) ?? null : null;
      if (item.kind === 'story' && parentWorkItemId === null) {
        report.counts.skipped += 1;
        report.items.push({
          sourceKey: item.sourceKey,
          kind: item.kind,
          outcome: 'skipped',
          reason: `Epic parent « ${item.parentKey} » non importé.`,
        });
        continue;
      }

      const current = existing.get(item.sourceKey);

      if (current && current.sourceExcerptHash === item.sourceExcerptHash) {
        report.counts.unchanged += 1;
        report.items.push({ sourceKey: item.sourceKey, kind: item.kind, outcome: 'unchanged', workItemId: current.id });
        if (item.kind === 'epic') epicWorkItemId.set(item.sourceKey, current.id);
        continue;
      }

      if (current && current.status !== 'triage') {
        report.counts.conflict += 1;
        report.items.push({
          sourceKey: item.sourceKey,
          kind: item.kind,
          outcome: 'conflict',
          workItemId: current.id,
          reason: `Le document a changé, mais le ticket est passé en « ${current.status} » — arbitrage humain requis.`,
        });
        if (item.kind === 'epic') epicWorkItemId.set(item.sourceKey, current.id);
        continue;
      }

      if (dryRun) {
        const outcome: ImportOutcome = current ? 'updated' : 'created';
        report.counts[outcome] += 1;
        report.items.push({ sourceKey: item.sourceKey, kind: item.kind, outcome, workItemId: current?.id });
        // A dry run cannot know a future id; a placeholder keeps stories from
        // being reported as orphans for a reason that is an artefact of the
        // preview rather than of the document.
        if (item.kind === 'epic') epicWorkItemId.set(item.sourceKey, current?.id ?? -1);
        continue;
      }

      const now = new Date();
      const saved = await this.workItems.save(
        this.workItems.create({
          ...(current ? { id: current.id } : {}),
          title: item.title.slice(0, 200),
          description: item.body,
          type: item.kind === 'epic' ? 'epic' : 'story',
          status: 'triage',
          priority: item.priority ?? 'P2',
          domainId: placement.domainId,
          capabilityId: placement.capabilityId,
          parentId: parentWorkItemId,
          reporter: actorEmail,
          sourceKind: 'manifest',
          sourceRefId: versionRow.id,
          sourceKey: item.sourceKey,
          sourceAuthor: versionRow.receivedFrom,
          sourceExcerptHash: item.sourceExcerptHash,
          position: 0,
          estimatePoints: 0,
          createdAt: current?.createdAt ?? now,
          updatedAt: now,
        }),
      );

      const outcome: ImportOutcome = current ? 'updated' : 'created';
      report.counts[outcome] += 1;
      report.items.push({ sourceKey: item.sourceKey, kind: item.kind, outcome, workItemId: saved.id });
      if (item.kind === 'epic') epicWorkItemId.set(item.sourceKey, saved.id);
    }

    return report;
  }
}

type Placement =
  | { ok: true; domainId: string | null; capabilityId: string | null }
  | { ok: false; reason: string };

/**
 * Finds the domain and capability an item belongs to, by walking up its
 * declared parents. An epic hangs off a capability, a story off its epic, so a
 * story inherits the placement its epic resolved to.
 */
function resolvePlacement(
  item: ExecutionManifestItem,
  byKey: Map<string, ExecutionManifestItem>,
  domainByCode: Map<string, Domain>,
  capabilityByCode: Map<string, Capability>,
): Placement {
  let cursor: ExecutionManifestItem | undefined = item;
  const seen = new Set<string>();

  while (cursor?.parentKey) {
    if (seen.has(cursor.sourceKey)) {
      return { ok: false, reason: `Cycle de rattachement autour de « ${cursor.sourceKey} ».` };
    }
    seen.add(cursor.sourceKey);

    const parentKey = cursor.parentKey;
    const capability = capabilityByCode.get(parentKey);
    if (capability) {
      return { ok: true, domainId: capability.domainId, capabilityId: capability.id };
    }
    const domain = domainByCode.get(parentKey);
    if (domain) {
      return { ok: true, domainId: domain.id, capabilityId: null };
    }

    const parent: ExecutionManifestItem | undefined = byKey.get(parentKey);
    if (!parent) {
      return {
        ok: false,
        reason: `« ${parentKey} » n'existe ni dans le registre des domaines ni dans le manifest.`,
      };
    }
    cursor = parent;
  }

  return { ok: false, reason: `« ${item.sourceKey} » n'est rattaché à aucun domaine.` };
}
