import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { ActivityService, type ActivityQuery } from './activity.service';
import type { ActivityCategory } from './activity.entity';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';

class CreateActivityEventDto {
  @IsIn(['finance', 'tech', 'incident', 'support', 'commercial'])
  cat!: ActivityCategory;
  @IsString() actor!: string;
  @IsString() text!: string;
  @IsOptional() @IsString() ref?: string;
}

@ApiBearerAuth()
@ApiTags('activity')
@Controller('activity')
export class ActivityController {
  constructor(private readonly svc: ActivityService) {}

  @Get()
  list(@Query() query: ActivityQuery) {
    return this.svc.list(query);
  }

  @Post()
  @HqRoles(HqRole.Operator)
  record(@Body() dto: CreateActivityEventDto) {
    return this.svc.record(dto);
  }
}
