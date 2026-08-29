import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DeploysService } from './deploys.service';
import { CreateDeployDto } from './dto/create-deploy.dto';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';

@ApiBearerAuth()
@ApiTags('deploys')
@Controller('deploys')
@HqRoles(HqRole.Viewer)
export class DeploysController {
  constructor(private readonly svc: DeploysService) {}

  @Get()
  list(@Query('app') app?: string, @Query('env') env?: string) {
    return this.svc.list(app, env);
  }

  /**
   * Deployment ticket composer's commit-range lookup — `dev` vs `main`
   * per app, computed from GitHub. `hq:operator`, matching ticket
   * creation: this only prepares data for filing a ticket, it approves
   * nothing (that's `hq:owner`-gated, on the ticket itself).
   */
  @Get('commit-ranges')
  @HqRoles(HqRole.Operator)
  commitRanges(@Query('apps') apps?: string) {
    const list = (apps ?? '').split(',').map((a) => a.trim()).filter(Boolean);
    return this.svc.commitRanges(list);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  @HqRoles(HqRole.Operator)
  create(@Body() dto: CreateDeployDto) {
    return this.svc.create(dto);
  }

  @Post(':id/rollback')
  @HqRoles(HqRole.Operator)
  rollback(@Param('id') id: string) {
    return this.svc.rollback(id);
  }
}
