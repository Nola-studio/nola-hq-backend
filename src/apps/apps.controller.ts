import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AppKind, AppsService } from './apps.service';

@ApiBearerAuth()
@ApiTags('apps')
@Controller('apps')
export class AppsController {
  constructor(private readonly svc: AppsService) {}

  /**
   * Liste les apps actuellement enregistrées sur le bus (projection live).
   * `?kind=app` ou `?kind=service` pour filtrer (rendu séparé HQ Tenants
   * vs HQ Operations).
   */
  @Get()
  @ApiQuery({ name: 'kind', required: false, enum: ['app', 'service'] })
  list(@Query('kind') kind?: string) {
    if (kind && kind !== 'app' && kind !== 'service') {
      throw new BadRequestException(`kind must be 'app' or 'service' (got "${kind}")`);
    }
    return this.svc.listApps(kind as AppKind | undefined);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.getApp(id);
  }

  /** Historique des manifestes (jusqu'à 10 versions). */
  @Get(':id/manifests')
  history(@Param('id') id: string) {
    return this.svc.listManifestHistory(id);
  }
}
