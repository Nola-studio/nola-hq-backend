import {
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'node:crypto';
import {
  ExecutionReference,
  ExecutionReferenceVersion,
  MAX_REFERENCE_CONTENT_BYTES,
} from './execution-reference.entity';
import {
  AddExecutionReferenceVersionDto,
  CreateExecutionReferenceDto,
  UpdateExecutionReferenceDto,
} from './dto/create-execution-reference.dto';

/**
 * Columns of a version *except* `content`. A referential runs to tens of
 * thousands of characters, so a listing that selected it would ship the whole
 * corpus to render a table of dates — content is fetched one version at a
 * time, through its own route.
 */
const VERSION_METADATA_COLUMNS = [
  'id',
  'referenceId',
  'version',
  'status',
  'format',
  'contentHash',
  'sizeBytes',
  'receivedFrom',
  'receivedAt',
  'effectiveDate',
  'publishedBy',
  'publishedAt',
] as const;

@Injectable()
export class ExecutionReferencesService {
  constructor(
    @InjectRepository(ExecutionReference)
    private readonly references: Repository<ExecutionReference>,
    @InjectRepository(ExecutionReferenceVersion)
    private readonly versions: Repository<ExecutionReferenceVersion>,
  ) {}

  list(): Promise<ExecutionReference[]> {
    return this.references.find({ order: { updatedAt: 'DESC' } });
  }

  async findByKey(key: string): Promise<ExecutionReference> {
    const reference = await this.references.findOne({ where: { key: normalizeKey(key) } });
    if (!reference) throw new NotFoundException(`Référentiel ${key} introuvable`);
    return reference;
  }

  /** Metadata only — see {@link VERSION_METADATA_COLUMNS}. */
  async listVersions(key: string): Promise<Partial<ExecutionReferenceVersion>[]> {
    const reference = await this.findByKey(key);
    return this.versions.find({
      where: { referenceId: reference.id },
      select: [...VERSION_METADATA_COLUMNS],
      order: { receivedAt: 'DESC' },
    });
  }

  /** The only route that returns `content`, one version at a time. */
  async findVersion(key: string, version: string): Promise<ExecutionReferenceVersion> {
    const reference = await this.findByKey(key);
    const row = await this.versions.findOne({ where: { referenceId: reference.id, version } });
    if (!row) throw new NotFoundException(`Version ${version} de ${reference.key} introuvable`);
    return row;
  }

  async create(dto: CreateExecutionReferenceDto, actorEmail: string): Promise<ExecutionReference> {
    const key = normalizeKey(dto.key);
    if (await this.references.findOne({ where: { key } })) {
      throw new ConflictException(`Le référentiel ${key} existe déjà — déposez une nouvelle version.`);
    }
    assertWithinSizeLimit(dto.content);

    const now = new Date();
    const reference = await this.references.save(
      this.references.create({
        key,
        title: dto.title,
        domainId: dto.domainId ?? null,
        productId: dto.productId ?? null,
        projectId: dto.projectId ?? null,
        origin: dto.origin ?? 'internal',
        owner: dto.owner ?? actorEmail,
        latestVersionId: null,
        createdAt: now,
        updatedAt: now,
      }),
    );

    await this.storeVersion(reference, {
      version: dto.version,
      format: dto.format,
      content: dto.content,
      effectiveDate: dto.effectiveDate,
    }, actorEmail, now);

    return this.findByKey(key);
  }

  /**
   * Files a new revision. Never an overwrite: two guards stand between a
   * sender and a silent replacement (EXE-01).
   *
   *  - the same `version` string twice is a conflict, so a correction has to
   *    be named — `1.3.1`, not another `1.3`;
   *  - identical content under a new version number is also a conflict, since
   *    it means the sender is renumbering rather than changing anything.
   */
  async addVersion(
    key: string,
    dto: AddExecutionReferenceVersionDto,
    actorEmail: string,
  ): Promise<ExecutionReferenceVersion> {
    const reference = await this.findByKey(key);
    assertWithinSizeLimit(dto.content);

    const existing = await this.versions.findOne({
      where: { referenceId: reference.id, version: dto.version },
    });
    if (existing) {
      throw new ConflictException(
        `${reference.key} a déjà une version ${dto.version} (empreinte ${existing.contentHash.slice(0, 12)}…). ` +
          `Le document original n'est jamais remplacé : donnez un nouveau numéro de version.`,
      );
    }

    const hash = sha256(dto.content);
    const sameContent = await this.versions.findOne({
      where: { referenceId: reference.id, contentHash: hash },
    });
    if (sameContent) {
      throw new ConflictException(
        `Contenu identique à la version ${sameContent.version} de ${reference.key} — rien à enregistrer.`,
      );
    }

    return this.storeVersion(reference, dto, actorEmail, new Date());
  }

  async update(key: string, dto: UpdateExecutionReferenceDto): Promise<ExecutionReference> {
    const reference = await this.findByKey(key);
    if (dto.title !== undefined) reference.title = dto.title;
    if (dto.owner !== undefined) reference.owner = dto.owner;
    if (dto.domainId !== undefined) reference.domainId = dto.domainId;
    if (dto.productId !== undefined) reference.productId = dto.productId;
    if (dto.projectId !== undefined) reference.projectId = dto.projectId;
    reference.updatedAt = new Date();
    return this.references.save(reference);
  }

  private async storeVersion(
    reference: ExecutionReference,
    dto: { version: string; format: ExecutionReferenceVersion['format']; content: string; effectiveDate?: string },
    actorEmail: string,
    now: Date,
  ): Promise<ExecutionReferenceVersion> {
    const saved = await this.versions.save(
      this.versions.create({
        referenceId: reference.id,
        version: dto.version,
        status: 'received',
        format: dto.format,
        content: dto.content,
        contentHash: sha256(dto.content),
        sizeBytes: Buffer.byteLength(dto.content, 'utf8'),
        receivedFrom: actorEmail,
        receivedAt: now,
        effectiveDate: dto.effectiveDate ?? null,
        publishedBy: null,
        publishedAt: null,
      }),
    );

    reference.latestVersionId = saved.id;
    reference.updatedAt = now;
    await this.references.save(reference);

    return saved;
  }
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/** Keys are case-insensitive on the way in, uppercase in storage. */
function normalizeKey(key: string): string {
  return key.trim().toUpperCase();
}

function assertWithinSizeLimit(content: string): void {
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > MAX_REFERENCE_CONTENT_BYTES) {
    throw new PayloadTooLargeException(
      `Document de ${bytes} octets — la limite est de ${MAX_REFERENCE_CONTENT_BYTES}.`,
    );
  }
}
