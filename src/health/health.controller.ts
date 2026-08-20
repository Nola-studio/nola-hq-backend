import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { readFileSync } from 'fs';
import { join } from 'path';
import { HealthService } from './health.service';
import { Public } from '../common/auth/public.decorator';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';

/**
 * Identité de build, calculée une fois au chargement : version du
 * package.json (racine de l'app Railpack) + métadonnées injectées par
 * Railway au déploiement. Hors Railway (dev local), commit/branch/
 * environment restent null.
 */
const VERSION_INFO = (() => {
  let version = '0.0.0';
  try {
    version = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).version ?? version;
  } catch {
    // pas de package.json au cwd — on garde le défaut
  }
  return {
    service: process.env.RAILWAY_SERVICE_NAME ?? 'nola-hq-backend',
    version,
    commit: (process.env.RAILWAY_GIT_COMMIT_SHA ?? '').slice(0, 7) || null,
    branch: process.env.RAILWAY_GIT_BRANCH ?? null,
    environment: process.env.RAILWAY_ENVIRONMENT_NAME ?? null,
  };
})();

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

  @Public()
  @Get('version')
  version() {
    return VERSION_INFO;
  }

  @Get()
  @HqRoles(HqRole.Viewer)
  findAll() {
    return this.svc.findAll();
  }

  @Get('overall')
  @HqRoles(HqRole.Viewer)
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
