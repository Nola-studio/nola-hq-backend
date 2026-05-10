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
  create(@Body() dto: CreateDeployDto) {
    return this.svc.create(dto);
  }

  @Post(':id/rollback')
  rollback(@Param('id') id: string) {
    return this.svc.rollback(id);
  }
}
