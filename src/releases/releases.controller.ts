import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReleasesService } from './releases.service';
import { CreateReleaseDto, UpdateReleaseDto } from './dto/release.dto';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';

@ApiBearerAuth()
@ApiTags('releases')
@Controller('releases')
@HqRoles(HqRole.Viewer)
export class ReleasesController {
  constructor(private readonly svc: ReleasesService) {}

  @Get()
  @ApiOperation({ summary: 'Le registre des versions (REL-00).' })
  list(@Query('includeCancelled') includeCancelled?: string) {
    return this.svc.list(includeCancelled === 'true');
  }

  @Get('counts')
  @ApiOperation({ summary: 'Combien de tickets par version — pour les listes.' })
  counts() {
    return this.svc.countsByRelease();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.findOne(id);
  }

  @Get(':id/contents')
  @ApiOperation({ summary: 'Ce que la version contient, et ce qui reste avant de livrer.' })
  contents(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.contents(id);
  }

  @Get(':id/items')
  @ApiOperation({ summary: 'Les tickets de la version, sans répéter les sous-tâches.' })
  items(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.rootsOf(id);
  }

  @Post()
  @HqRoles(HqRole.Operator)
  create(@Body() dto: CreateReleaseDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @HqRoles(HqRole.Operator)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateReleaseDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @HqRoles(HqRole.Operator)
  @ApiOperation({ summary: 'Refusé si la version porte du travail — annulez-la plutôt.' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.remove(id);
  }
}
