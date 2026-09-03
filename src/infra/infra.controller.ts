import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RailwayService } from './railway.service';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';

@ApiBearerAuth()
@ApiTags('infra')
@Controller('infra')
export class InfraController {
  constructor(private readonly railway: RailwayService) {}

  @Get('railway/usage')
  @HqRoles(HqRole.Viewer)
  @ApiOperation({ summary: 'Get cached Railway infrastructure per-project usage & cost' })
  @ApiQuery({ name: 'refresh', required: false, type: Boolean })
  getRailwayUsage(@Query('refresh') refresh?: string) {
    const forceRefresh = refresh === 'true' || refresh === '1';
    return this.railway.getUsage(forceRefresh);
  }
}
