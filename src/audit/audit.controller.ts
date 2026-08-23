import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { AuditService, type AuditQuery } from './audit.service';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';

class CreateAuditEntryDto {
  @IsString() actor!: string;
  @IsString() action!: string;
  @IsString() target!: string;
  @IsString() ip!: string;
  @IsString() meta!: string;
}

@ApiBearerAuth()
@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly svc: AuditService) {}

  @Get()
  @HqRoles(HqRole.Owner)
  list(@Query() query: AuditQuery) {
    return this.svc.list(query);
  }

  @Post()
  @HqRoles(HqRole.Operator)
  record(@Body() dto: CreateAuditEntryDto) {
    return this.svc.record(dto);
  }
}
