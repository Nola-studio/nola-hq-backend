import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CompanyService } from './company.service';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';

/** Read-only: brands are seeded by migration, no reason to edit from the UI yet. */
@ApiBearerAuth()
@ApiTags('company')
@Controller('company')
export class CompanyController {
  constructor(private readonly svc: CompanyService) {}

  @Get('business-units')
  @HqRoles(HqRole.Viewer)
  listBusinessUnits() {
    return this.svc.listBusinessUnits();
  }

  @Get('business-units/:code')
  @HqRoles(HqRole.Viewer)
  findBusinessUnit(@Param('code') code: string) {
    return this.svc.findBusinessUnit(code);
  }

  @Get('products')
  @HqRoles(HqRole.Viewer)
  listProducts(@Query('isInternal') isInternal?: string) {
    const filter = isInternal !== undefined ? { isInternal: isInternal === 'true' } : undefined;
    return this.svc.listProducts(filter);
  }

  @Get('legal-entities')
  @HqRoles(HqRole.Viewer)
  listLegalEntities() {
    return this.svc.listLegalEntities();
  }
}
