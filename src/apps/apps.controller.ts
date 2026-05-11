import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AppsService } from './apps.service';

@ApiBearerAuth()
@ApiTags('apps')
@Controller('apps')
export class AppsController {
  constructor(private readonly svc: AppsService) {}

  /** Liste les apps actuellement enregistrées sur le bus (projection live). */
  @Get()
  list() {
    return this.svc.listApps();
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
