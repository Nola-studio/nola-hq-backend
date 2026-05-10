import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { Public } from '../common/auth/public.decorator';

@ApiBearerAuth()
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly svc: HealthService) {}

  @Public()
  @Get('ping')
  ping() {
    return { ok: true, service: 'nola-hq-backend' };
  }

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Get('overall')
  overall() {
    return this.svc.overall();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }
}
