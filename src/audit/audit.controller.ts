import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { AuditService, type AuditQuery } from './audit.service';

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
  list(@Query() query: AuditQuery) {
    return this.svc.list(query);
  }

  @Post()
  record(@Body() dto: CreateAuditEntryDto) {
    return this.svc.record(dto);
  }
}
