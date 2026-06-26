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
export class DeploysController {
  constructor(private readonly svc: DeploysService) {}

  @Get()
  list(@Query('app') app?: string, @Query('env') env?: string) {
    return this.svc.list(app, env);
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
