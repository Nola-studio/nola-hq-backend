import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
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

  /**
   * Recent incidents replayed from `nola.events.nola.health.incident.*`.
   * Pass `?open=true` to get only currently-open incidents (useful for
   * banners). Defaults to merged open + closed, newest first.
   */
  @Get('incidents')
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'open', required: false, type: Boolean })
  incidents(@Query('limit') limit?: string, @Query('open') open?: string) {
    return this.svc.listIncidents({
      limit: limit ? Number.parseInt(limit, 10) : undefined,
      open: open === 'true',
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }
}
