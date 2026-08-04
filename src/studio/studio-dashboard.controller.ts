import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StudioDashboardService } from './studio-dashboard.service';

@ApiBearerAuth()
@ApiTags('studio')
@Controller('studio/dashboard')
export class StudioDashboardController {
  constructor(private readonly svc: StudioDashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Single aggregate payload for the Studio dashboard tab' })
  get() {
    return this.svc.get();
  }
}
