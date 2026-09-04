import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ExecutionReferencesService } from '../execution-references/execution-references.service';
import { ExecutionImportService } from '../execution-references/execution-import.service';
import {
  AddExecutionReferenceVersionDto,
  CreateExecutionReferenceDto,
} from '../execution-references/dto/create-execution-reference.dto';
import { IdempotencyService } from './idempotency.service';
import { Public } from '../common/auth/public.decorator';
import { ApiScopes } from '../common/auth/api-scopes.decorator';
import { MachineClientGuard, type MachineClient } from '../common/auth/machine-client.guard';
import { CurrentMachineClient } from './current-machine-client.decorator';

/**
 * The public ingestion API (EXE-02).
 *
 * Every route delegates to the very services the console uses — the same
 * registry, the same parser, the same import. The referential's own words:
 * « l'API est une porte d'entrée vers Nolaa HQ ; elle ne constitue jamais une
 * source de vérité parallèle ». A second code path would be a second truth,
 * and the whole programme exists to remove those.
 *
 * `@Public()` steps past the console's session guard — a service has no
 * cookie — and `MachineClientGuard`, applied at class level so no route can
 * forget it, lets the caller in on its own terms: a client-credentials token
 * from Nola Auth, carrying the scopes as realm roles.
 *
 * Rate limiting is tighter here than on the console: an integration that
 * loses its loop should hit a wall long before the database does.
 *
 * **Not yet implemented: signed webhooks.** §5.7 lists eight of them
 * (`execution_reference.received` … `backlog.conflict_detected`). They need a
 * subscriber registry, an outbound dispatcher with retry and a signing
 * scheme — a body of work of its own, and shipping half of it would leave
 * integrators polling anyway. Until then this API is request/response, and
 * `GET …/status` is how a caller learns where its document stands.
 */
@ApiBearerAuth()
@ApiTags('public-api')
@ApiHeader({
  name: 'Idempotency-Key',
  required: false,
  description:
    "Rejoue la même réponse si la commande a déjà été exécutée. Une même clé avec un corps différent est refusée.",
})
@Public()
@UseGuards(MachineClientGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller('public/v1/execution-references')
export class PublicExecutionReferencesController {
  constructor(
    private readonly references: ExecutionReferencesService,
    private readonly imports: ExecutionImportService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get()
  @ApiScopes('execution-reference:read')
  @ApiOperation({ summary: 'Les référentiels enregistrés' })
  list() {
    return this.references.list();
  }

  @Get(':key')
  @ApiScopes('execution-reference:read')
  findOne(@Param('key') key: string) {
    return this.references.findByKey(key);
  }

  @Get(':key/versions')
  @ApiScopes('execution-reference:read')
  listVersions(@Param('key') key: string) {
    return this.references.listVersions(key);
  }

  @Get(':key/versions/:version/status')
  @ApiScopes('execution-reference:read')
  @ApiOperation({ summary: "Où en est ce document : reçu, analysé, et ce qu'il a produit" })
  async status(@Param('key') key: string, @Param('version') version: string) {
    const row = await this.references.findVersion(key, version);
    const manifest = await this.imports.findManifestOrNull(key, version);
    return {
      version: row.version,
      status: row.status,
      contentHash: row.contentHash,
      receivedAt: row.receivedAt,
      parsed: manifest !== null,
      parsedAt: manifest?.parsedAt ?? null,
      issues: manifest?.issues.length ?? null,
    };
  }

  @Get(':key/versions/:version/manifest')
  @ApiScopes('execution-reference:read')
  manifest(@Param('key') key: string, @Param('version') version: string) {
    return this.imports.findManifest(key, version);
  }

  @Get(':key/traceability')
  @ApiScopes('execution-reference:read')
  traceability(@Param('key') key: string) {
    return this.imports.traceability(key);
  }

  @Post()
  @ApiScopes('execution-reference:write')
  @ApiOperation({ summary: 'Transmet un référentiel et sa première version' })
  create(
    @Body() dto: CreateExecutionReferenceDto,
    @CurrentMachineClient() client: MachineClient,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.idempotency.run(client.clientId, idempotencyKey, 'POST /public/v1/execution-references', dto, () =>
      this.references.create(dto, client.clientId),
    );
  }

  @Post(':key/versions')
  @ApiScopes('execution-reference:write')
  @ApiOperation({ summary: 'Transmet une nouvelle version — jamais un écrasement' })
  addVersion(
    @Param('key') key: string,
    @Body() dto: AddExecutionReferenceVersionDto,
    @CurrentMachineClient() client: MachineClient,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.idempotency.run(
      client.clientId,
      idempotencyKey,
      `POST /public/v1/execution-references/${key}/versions`,
      dto,
      () => this.references.addVersion(key, dto, client.clientId),
    );
  }

  @Post(':key/versions/:version/parse')
  @ApiScopes('execution-reference:parse')
  @ApiOperation({ summary: "Analyse le document — ne crée aucun objet opérationnel" })
  parse(
    @Param('key') key: string,
    @Param('version') version: string,
    @CurrentMachineClient() client: MachineClient,
  ) {
    return this.imports.parse(key, version, client.clientId);
  }

  @Post(':key/versions/:version/backlog/preview')
  @ApiScopes('backlog:preview')
  @ApiOperation({ summary: "Ce que l'import ferait, sans rien écrire" })
  preview(
    @Param('key') key: string,
    @Param('version') version: string,
    @CurrentMachineClient() client: MachineClient,
  ) {
    return this.imports.import(key, version, client.clientId, true);
  }

  /**
   * `backlog:write` et `backlog:preview` sont deux scopes distincts à dessein.
   * Une intégration peut proposer sans pouvoir écrire — c'est exactement la
   * séparation qu'EXE-05 exige entre une proposition et une mutation du
   * backlog canonique.
   */
  @Post(':key/versions/:version/backlog/apply')
  @ApiScopes('backlog:write')
  @ApiOperation({ summary: 'Applique le backlog proposé' })
  apply(
    @Param('key') key: string,
    @Param('version') version: string,
    @CurrentMachineClient() client: MachineClient,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.idempotency.run(
      client.clientId,
      idempotencyKey,
      `POST /public/v1/execution-references/${key}/versions/${version}/backlog/apply`,
      { dryRun },
      () => this.imports.import(key, version, client.clientId, dryRun === 'true'),
    );
  }
}
