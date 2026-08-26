import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import { LogsService, type LogQuery } from './logs.service';
import type { LogLevel } from './log.entity';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';

class IngestLogDto {
  @IsString() svc!: string;
  @IsIn(['INFO', 'WARN', 'ERROR'])
  lvl!: LogLevel;
  @IsString() msg!: string;
}

@ApiBearerAuth()
@ApiTags('logs')
@Controller('logs')
@HqRoles(HqRole.Viewer)
export class LogsController {
  constructor(private readonly svc: LogsService) {}

  @Get()
  list(@Query() query: LogQuery) {
    return this.svc.list(query);
  }

  @Post()
  @HqRoles(HqRole.Operator)
  ingest(@Body() dto: IngestLogDto) {
    return this.svc.ingest(dto.svc, dto.lvl, dto.msg);
  }
}
