import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { AppModulesService } from './app-modules.service';

class ToggleDto {
  @IsOptional() @IsBoolean() default?: boolean;
  @IsOptional() @IsBoolean() beta?: boolean;
}

@ApiBearerAuth()
@ApiTags('modules')
@Controller('modules')
export class AppModulesController {
  constructor(private readonly svc: AppModulesService) {}

  @Get()
  findAll(@Query('app') app?: string) {
    return this.svc.findAll(app);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Patch(':id')
  async patch(@Param('id') id: string, @Body() dto: ToggleDto) {
    if (dto.default !== undefined) await this.svc.toggleDefault(id, dto.default);
    if (dto.beta !== undefined) await this.svc.toggleBeta(id, dto.beta);
    return this.svc.findOne(id);
  }
}
