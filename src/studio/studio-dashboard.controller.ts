import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { StudioDashboardService } from './studio-dashboard.service';
import { GetDashboardDto } from './dto/get-dashboard.dto';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';

@ApiBearerAuth()
@ApiTags('studio')
@Controller('studio/dashboard')
export class StudioDashboardController {
  constructor(private readonly svc: StudioDashboardService) {}

  @Get()
  @HqRoles(HqRole.Viewer)
  @ApiOperation({ summary: 'Two-section, period-filtered dashboard payload — mirrors the workbook' })
  @ApiQuery({ name: 'period', required: false, enum: ['ytd', 'month', 'year'] })
  @ApiQuery({ name: 'year', required: false, type: Number })
  @ApiQuery({ name: 'month', required: false, type: Number })
  get(@Query() query: GetDashboardDto) {
    return this.svc.get(query);
  }
}
