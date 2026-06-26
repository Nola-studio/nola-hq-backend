import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { DateRangeDto } from './dto/date-range.dto';

@ApiBearerAuth()
@ApiTags('analytics')
@Controller()
export class AnalyticsController {
  constructor(private readonly svc: AnalyticsService) {}

  @Get('kpis')
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  kpis(@Query() range: DateRangeDto) {
    return this.svc.kpiList(range);
  }

  @Get('dashboard')
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  dashboard(@Query() range: DateRangeDto) {
    return this.svc.dashboard(range);
  }

  @Get('analytics/growth')
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  growth(@Query() range: DateRangeDto) {
    return this.svc.growth(range);
  }

  @Get('nps')
  nps() {
    return this.svc.nps();
  }
}
