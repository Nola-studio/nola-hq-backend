import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ModulesService } from './modules.service';
import { UpdateModuleDto } from './dto/update-module.dto';
import { CreateModuleDto } from './dto/create-module.dto';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';

/**
 * Feature-module catalogue + override layer for the HQ "Modules" screen.
 *
 * Reads merge each app's manifest (`AppsService` projection) with the
 * persisted override (`module_overrides`); mutations write the override —
 * the manifest is never mutated from here. Same override pattern as `plans`.
 */
@ApiBearerAuth()
@ApiTags('modules')
@Controller('modules')
@HqRoles(HqRole.Viewer)
export class ModulesController {
  constructor(private readonly svc: ModulesService) {}

  @Get()
  @ApiQuery({ name: 'app', required: false, type: String })
  list(@Query('app') app?: string) {
    return this.svc.list({ app });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Patch(':id')
  @HqRoles(HqRole.Operator)
  @ApiOperation({
    summary: 'Override a module (default/beta/label); unlock to release',
  })
  update(@Param('id') id: string, @Body() dto: UpdateModuleDto) {
    return this.svc.update(id, dto);
  }

  @Post()
  @HqRoles(HqRole.Operator)
  @ApiOperation({ summary: 'Register a module override (custom or manifest-seeded)' })
  create(@Body() dto: CreateModuleDto) {
    return this.svc.create(dto);
  }
}
