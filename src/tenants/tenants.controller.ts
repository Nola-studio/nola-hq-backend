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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { ListTenantsDto } from './dto/list-tenants.dto';
import { ChangePlanDto } from './dto/change-plan.dto';

@ApiBearerAuth()
@ApiTags('tenants')
@Controller('tenants')
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

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
  }

  @Post(':id/change-plan')
  changePlan(@Param('id') id: string, @Body() dto: ChangePlanDto) {
    return this.svc.changePlan(id, dto.plan);
  }

  @Post(':id/suspend')
  suspend(@Param('id') id: string) {
    return this.svc.suspend(id);
  }

  @Post(':id/resume')
  resume(@Param('id') id: string) {
    return this.svc.resume(id);
  }

  @Post(':id/remind')
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
