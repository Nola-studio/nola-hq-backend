import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MomoService } from './momo.service';
import { CreateMomoDto } from './dto/create-momo.dto';
import { ListMomoDto } from './dto/list-momo.dto';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';

@ApiBearerAuth()
@ApiTags('momo')
@Controller('momo')
export class MomoController {
  constructor(private readonly svc: MomoService) {}

  @Get()
  list(@Query() query: ListMomoDto) {
    return this.svc.list(query);
  }

  @Get('summary')
  summary() {
    return this.svc.summary();
  }

  @Post()
  @HqRoles(HqRole.Operator)
  create(@Body() dto: CreateMomoDto) {
    return this.svc.create(dto);
  }
}
