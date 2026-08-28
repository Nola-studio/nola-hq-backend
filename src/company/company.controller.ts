import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CompanyService } from './company.service';
import { CreateBusinessUnitDto } from './dto/create-business-unit.dto';
import { UpdateBusinessUnitDto } from './dto/update-business-unit.dto';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';

/**
 * Reads (`hq:viewer`) list the seeded/created brands. Creating or editing a
 * business unit is `hq:owner`-only — it's a legal/financial identity (drives
 * invoice/contract branding and a new `hq:bu:<code>` auth scope), not a
 * catalog entry an operator should self-serve. There is deliberately no
 * delete: every FK onto `business_units` is `ON DELETE RESTRICT`, so use
 * `isActive` instead.
 */
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

  @Post('business-units')
  @HqRoles(HqRole.Owner)
  createBusinessUnit(@Body() dto: CreateBusinessUnitDto) {
    return this.svc.createBusinessUnit(dto);
  }

  /** Everything but `code` — immutable once created, see `UpdateBusinessUnitDto`. */
  @Patch('business-units/:code')
  @HqRoles(HqRole.Owner)
  updateBusinessUnit(@Param('code') code: string, @Body() dto: UpdateBusinessUnitDto) {
    return this.svc.updateBusinessUnit(code, dto);
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
