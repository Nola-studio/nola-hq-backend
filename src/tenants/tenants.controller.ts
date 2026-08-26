import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { ListTenantsDto } from './dto/list-tenants.dto';
import { ChangePlanDto } from './dto/change-plan.dto';
import { ActivateAppDto } from './dto/activate-app.dto';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';

@ApiBearerAuth()
@ApiTags('tenants')
@Controller('tenants')
@HqRoles(HqRole.Viewer)
export class TenantsController {
  constructor(private readonly svc: TenantsService) {}

  @Get()
  list(@Query() query: ListTenantsDto) {
    return this.svc.list(query);
  }

  @Get('recovery')
  recovery() {
    return this.svc.recoveryList();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Get(':id/detail')
  detail(@Param('id') id: string) {
    return this.svc.detail(id);
  }

  /**
   * Convenience resolver for the TenantDetail "Users" tab. The console
   * holds a `tenantId`, not an `organizationId`; this maps
   * tenant → org → nola-iam memberships in one call. Equivalent to
   * `GET /iam/orgs/:orgId/memberships` once you know the org id.
   */
  @Get(':id/memberships')
  @ApiOperation({
    summary: 'List the IAM memberships of a tenant (resolves tenant→org)',
  })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  memberships(
    @Param('id') id: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.svc.memberships(id, {
      includeInactive: includeInactive === 'true',
    });
  }

  @Post()
  @HqRoles(HqRole.Operator)
  create(@Body() dto: CreateTenantDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @HqRoles(HqRole.Operator)
  update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @HqRoles(HqRole.Owner)
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
  }

  @Post(':id/change-plan')
  @HqRoles(HqRole.Operator)
  changePlan(@Param('id') id: string, @Body() dto: ChangePlanDto) {
    return this.svc.changePlan(id, dto.plan, dto.app);
  }

  /**
   * Activate (provision) an app on an existing tenant. Idempotent: if the
   * app is already subscribed it returns the current subscription instead
   * of re-provisioning.
   */
  @Post(':id/apps')
  @HqRoles(HqRole.Operator)
  @ApiOperation({ summary: 'Activate an app on an existing tenant (idempotent)' })
  activateApp(@Param('id') id: string, @Body() dto: ActivateAppDto) {
    return this.svc.activateApp(id, dto.app, dto.plan);
  }

  @Post(':id/suspend')
  @HqRoles(HqRole.Operator)
  suspend(@Param('id') id: string) {
    return this.svc.suspend(id);
  }

  @Post(':id/resume')
  @HqRoles(HqRole.Operator)
  resume(@Param('id') id: string) {
    return this.svc.resume(id);
  }

  @Post(':id/remind')
  @HqRoles(HqRole.Operator)
  async remind(@Param('id') id: string, @Body() body: { channel?: string }) {
    return this.svc.sendReminder(id, body?.channel ?? 'whatsapp');
  }

  @Get(':id/export.csv')
  async exportCsv() {
    // Reserve route for future per-tenant CSV — for now the bulk export
    // is at GET /tenants/export.csv (handled below via list endpoint).
    return { todo: true };
  }
}
