import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import { LogsService, type LogQuery } from './logs.service';
import type { LogLevel } from './log.entity';

class IngestLogDto {
  @IsString() svc!: string;
  @IsIn(['INFO', 'WARN', 'ERROR'])
  lvl!: LogLevel;
  @IsString() msg!: string;
}

@ApiBearerAuth()
@ApiTags('logs')
@Controller('logs')
export class LogsController {
  constructor(private readonly svc: LogsService) {}

  @Get()
  list(@Query() query: LogQuery) {
    return this.svc.list(query);
  }

  @Post()
  ingest(@Body() dto: IngestLogDto) {
    return this.svc.ingest(dto.svc, dto.lvl, dto.msg);
  }
}
