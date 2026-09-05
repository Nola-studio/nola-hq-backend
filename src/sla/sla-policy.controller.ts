import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SlaPolicyService } from './sla-policy.service';
import { CreateSlaPolicyDto } from './dto/create-sla-policy.dto';
import { UpdateSlaPolicyDto } from './dto/update-sla-policy.dto';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';

/**
 * Per-brand, per-priority SLA targets — response and resolution minutes.
 * Reads are `hq:viewer`, matching every other config-read surface
 * (BusinessUnit, Product). Writes are `hq:owner`: these are contractual
 * commitments, not a catalog entry — the same posture as BusinessUnit
 * create/edit, stricter than Product's `hq:operator`.
 *
 * No breach alerting reads these yet — this is the model, not the alarm.
 */
@ApiBearerAuth()
@ApiTags('sla')
@Controller('sla-policies')
export class SlaPolicyController {
  constructor(private readonly svc: SlaPolicyService) {}

  @Get()
  @HqRoles(HqRole.Viewer)
  list(@Query('businessUnitCode') businessUnitCode?: string) {
    return this.svc.list(businessUnitCode);
  }

  @Get(':id')
  @HqRoles(HqRole.Viewer)
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  @HqRoles(HqRole.Owner)
  create(@Body() dto: CreateSlaPolicyDto) {
    return this.svc.create(dto);
  }

  /** Everything but `businessUnitCode`/`priority` — immutable once created, see `UpdateSlaPolicyDto`. */
  @Patch(':id')
  @HqRoles(HqRole.Owner)
  update(@Param('id') id: string, @Body() dto: UpdateSlaPolicyDto) {
    return this.svc.update(id, dto);
  }

  /** Reverts this (brand, priority) pair to "not tracked" — distinct from leaving a target null. */
  @Delete(':id')
  @HttpCode(204)
  @HqRoles(HqRole.Owner)
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
  }
}
