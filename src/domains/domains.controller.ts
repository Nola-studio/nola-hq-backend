import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DomainsService } from './domains.service';
import { UpdateCapabilityDto, UpdateDomainDto } from './dto/update-domain.dto';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';

/**
 * The twelve domains of the referential and their capabilities.
 *
 * Read is `hq:viewer` — the sidebar and every domain-scoped filter need it.
 * There is deliberately no create and no delete: the set of domains comes
 * from the referential and is seeded by migration, so adding one means
 * publishing a new referential version. Only `owner` and `position` are
 * patchable, and naming an owner is an `hq:owner` act (§14.2).
 */
@ApiBearerAuth()
@ApiTags('domains')
@Controller('domains')
export class DomainsController {
  constructor(private readonly svc: DomainsService) {}

  @Get()
  @HqRoles(HqRole.Viewer)
  @ApiOperation({ summary: 'Les 12 domaines, capacités incluses, triés par position' })
  list() {
    return this.svc.list();
  }

  @Get(':code')
  @HqRoles(HqRole.Viewer)
  findOne(@Param('code') code: string) {
    return this.svc.findByCode(code);
  }

  @Get(':code/capabilities')
  @HqRoles(HqRole.Viewer)
  listCapabilities(@Param('code') code: string) {
    return this.svc.listCapabilities(code);
  }

  @Patch(':code')
  @HqRoles(HqRole.Owner)
  @ApiOperation({ summary: 'Propriétaire et ordre uniquement — le code et le nom viennent du référentiel' })
  updateDomain(@Param('code') code: string, @Body() dto: UpdateDomainDto) {
    return this.svc.updateDomain(code, dto);
  }

  @Patch('capabilities/:code')
  @HqRoles(HqRole.Owner)
  updateCapability(@Param('code') code: string, @Body() dto: UpdateCapabilityDto) {
    return this.svc.updateCapability(code, dto);
  }
}
