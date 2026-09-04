import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ExecutionReferencesService } from './execution-references.service';
import {
  AddExecutionReferenceVersionDto,
  CreateExecutionReferenceDto,
  UpdateExecutionReferenceDto,
} from './dto/create-execution-reference.dto';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';
import { CurrentUser, type AuthenticatedUser } from '../common/auth/current-user.decorator';

/**
 * The registry of execution references (EXE-01) — the documents that describe
 * what NolaaStudio intends to build, kept versioned and fingerprinted.
 *
 * Reads need `hq:viewer`; filing a reference or a version needs `hq:operator`.
 * There is deliberately no `DELETE` and no way to edit a version: EXE-01
 * requires the original to survive, so a correction is a new version, and a
 * reference that no longer applies is superseded rather than removed.
 *
 * The public machine-to-machine surface (EXE-02) is a later lot; this
 * controller is the internal one, and both will share this service so HQ never
 * grows two ways in.
 */
@ApiBearerAuth()
@ApiTags('execution-references')
@Controller('execution-references')
export class ExecutionReferencesController {
  constructor(private readonly svc: ExecutionReferencesService) {}

  @Get()
  @HqRoles(HqRole.Viewer)
  @ApiOperation({ summary: 'Les référentiels enregistrés, le plus récemment modifié en tête' })
  list() {
    return this.svc.list();
  }

  @Get(':key')
  @HqRoles(HqRole.Viewer)
  findOne(@Param('key') key: string) {
    return this.svc.findByKey(key);
  }

  @Get(':key/versions')
  @HqRoles(HqRole.Viewer)
  @ApiOperation({ summary: 'Métadonnées des versions — sans le contenu, qui se lit une version à la fois' })
  listVersions(@Param('key') key: string) {
    return this.svc.listVersions(key);
  }

  @Get(':key/versions/:version/content')
  @HqRoles(HqRole.Viewer)
  @ApiOperation({ summary: 'Le document original de cette version, tel qu’il a été reçu' })
  findVersion(@Param('key') key: string, @Param('version') version: string) {
    return this.svc.findVersion(key, version);
  }

  @Post()
  @HqRoles(HqRole.Operator)
  @ApiOperation({ summary: 'Enregistre un référentiel et sa première version' })
  create(@Body() dto: CreateExecutionReferenceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.create(dto, user.email);
  }

  @Post(':key/versions')
  @HqRoles(HqRole.Operator)
  @ApiOperation({ summary: 'Dépose une nouvelle version — jamais un écrasement de la précédente' })
  addVersion(
    @Param('key') key: string,
    @Body() dto: AddExecutionReferenceVersionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.addVersion(key, dto, user.email);
  }

  @Patch(':key')
  @HqRoles(HqRole.Operator)
  @ApiOperation({ summary: 'Titre, propriétaire et rattachements — le contenu, lui, est immuable' })
  update(@Param('key') key: string, @Body() dto: UpdateExecutionReferenceDto) {
    return this.svc.update(key, dto);
  }
}
