import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CompanyService } from './company.service';
import { CreateBusinessUnitDto } from './dto/create-business-unit.dto';
import { UpdateBusinessUnitDto } from './dto/update-business-unit.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
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
  listProducts(@Query('isInternal') isInternal?: string, @Query('archived') archived?: string) {
    return this.svc.listProducts({
      isInternal: isInternal !== undefined ? isInternal === 'true' : undefined,
      archived: archived !== undefined ? archived === 'true' : undefined,
    });
  }

  /** Product CRUD is `hq:operator` — a catalog entry under an existing brand, not a legal identity like `BusinessUnit`. */
  @Post('products')
  @HqRoles(HqRole.Operator)
  createProduct(@Body() dto: CreateProductDto) {
    return this.svc.createProduct(dto);
  }

  /** Everything but `code`/`businessUnitCode` — immutable once created, see `UpdateProductDto`. */
  @Patch('products/:code')
  @HqRoles(HqRole.Operator)
  updateProduct(@Param('code') code: string, @Body() dto: UpdateProductDto) {
    return this.svc.updateProduct(code, dto);
  }

  /** Unconditional: nothing in the schema FKs onto `products`, so there's nothing to check before deleting. */
  @Delete('products/:code')
  @HttpCode(204)
  @HqRoles(HqRole.Operator)
  async removeProduct(@Param('code') code: string) {
    await this.svc.removeProduct(code);
  }

  @Get('legal-entities')
  @HqRoles(HqRole.Viewer)
  listLegalEntities() {
    return this.svc.listLegalEntities();
  }
}
