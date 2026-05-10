import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PlansService } from './plans.service';

@ApiBearerAuth()
@ApiTags('plans')
@Controller('plans')
export class PlansController {
  constructor(private readonly svc: PlansService) {}

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Get('feature-matrix')
  matrix() {
    return this.svc.matrixRows();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }
}
