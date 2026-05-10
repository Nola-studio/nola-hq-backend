import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';

@ApiBearerAuth()
@ApiTags('analytics')
@Controller()
export class AnalyticsController {
  constructor(private readonly svc: AnalyticsService) {}

  @Get('kpis')
  kpis() {
    return this.svc.kpiList();
  }

  @Get('dashboard')
  dashboard() {
    return this.svc.dashboard();
  }

  @Get('analytics/growth')
  growth() {
    return this.svc.growth();
  }

  @Get('nps')
  nps() {
    return this.svc.nps();
  }
}
