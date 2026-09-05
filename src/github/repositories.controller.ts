import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HqRole } from '../common/auth/hq-role.enum';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import {
  LinkProjectDto,
  ListRepositoriesDto,
  RegisterRepositoryDto,
  UpdateRepositoryDto,
} from './dto/repository.dto';
import { GithubAppService } from './github-app.service';
import { GithubWebhooksService } from './github-webhooks.service';
import { RepositoriesService } from './repositories.service';

@ApiBearerAuth()
@ApiTags('repositories')
@Controller('repositories')
export class RepositoriesController {
  constructor(
    private readonly svc: RepositoriesService,
    private readonly github: GithubAppService,
    private readonly webhooks: GithubWebhooksService,
  ) {}

  @Get()
  @HqRoles(HqRole.Viewer)
  @ApiOperation({ summary: 'Les dépôts connus de HQ, hors archivés par défaut.' })
  list(@Query() query: ListRepositoriesDto) {
    return this.svc.list(query);
  }

  @Get('github/status')
  @HqRoles(HqRole.Viewer)
  @ApiOperation({
    summary: 'L’état de la GitHub App : configurée, reconnue, et où l’installer.',
  })
  githubStatus() {
    return this.github.status();
  }

  @Get('allowed-for/:projectId')
  @HqRoles(HqRole.Viewer)
  @ApiOperation({
    summary: 'Les dépôts qu’un projet a le droit d’utiliser — la liste que « Start Work » propose.',
  })
  allowedFor(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.svc.allowedFor(projectId);
  }

  @Get(':id')
  @HqRoles(HqRole.Viewer)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.findOne(id);
  }

  @Get(':id/deliveries')
  @HqRoles(HqRole.Viewer)
  @ApiOperation({ summary: 'Ce que GitHub a raconté sur ce dépôt, du plus récent au plus ancien.' })
  deliveries(@Param('id', ParseUUIDPipe) id: string) {
    return this.webhooks.listForRepository(id);
  }

  @Get(':id/projects')
  @HqRoles(HqRole.Viewer)
  projects(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.projectsOf(id);
  }

  @Post('discover')
  @HqRoles(HqRole.Operator)
  @ApiOperation({
    summary: 'Enregistre tous les dépôts où la GitHub App est installée, sans en recopier les URL.',
  })
  discover() {
    return this.svc.discover();
  }

  @Post()
  @HqRoles(HqRole.Operator)
  @ApiOperation({ summary: 'Enregistre un dépôt depuis « owner/name » ou une URL GitHub.' })
  register(@Body() dto: RegisterRepositoryDto) {
    return this.svc.register(dto);
  }

  @Patch(':id')
  @HqRoles(HqRole.Operator)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRepositoryDto) {
    return this.svc.update(id, dto);
  }

  @Post(':id/sync')
  @HqRoles(HqRole.Operator)
  @ApiOperation({
    summary: 'Rapproche le dépôt de ce que GitHub en dit — branche par défaut, visibilité, description.',
  })
  sync(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.sync(id);
  }

  @Post(':id/archive')
  @HqRoles(HqRole.Operator)
  @ApiOperation({ summary: 'Archive un dépôt : il n’est plus proposé, rien n’est effacé.' })
  archive(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.archive(id);
  }

  @Post(':id/projects')
  @HqRoles(HqRole.Operator)
  @ApiOperation({ summary: 'Autorise un projet à travailler dans ce dépôt.' })
  link(@Param('id', ParseUUIDPipe) id: string, @Body() dto: LinkProjectDto) {
    return this.svc.linkProject(id, dto);
  }

  @Delete(':id/projects/:projectId')
  @HqRoles(HqRole.Operator)
  unlink(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.svc.unlinkProject(id, projectId);
  }
}
