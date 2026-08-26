import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DirectoryService } from './directory.service';
import { ListDirectoryDto } from './dto/list-directory.dto';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';

@ApiBearerAuth()
@ApiTags('directory')
@Controller()
@HqRoles(HqRole.Viewer)
export class DirectoryController {
  constructor(private readonly svc: DirectoryService) {}

  /** Liste statique des realms gérés par Nola (avec compteur users/tenants). */
  @Get('realms')
  realms() {
    return this.svc.realmSummaries();
  }

  /** Users Keycloak d'un realm donné (paginés). */
  @Get('realms/:realm/users')
  realmUsers(@Param('realm') realm: string, @Query() q: ListDirectoryDto) {
    return this.svc.usersInRealm(realm, q);
  }

  /** Users d'un tenant donné (via group Keycloak `/tenants/{id}`). */
  @Get('tenants/:id/users')
  tenantUsers(@Param('id') id: string, @Query() q: ListDirectoryDto) {
    return this.svc.usersInTenant(id, q);
  }

  /** Annuaire transverse — tous les users filtrés par realm/app/tenant/q. */
  @Get('directory/users')
  directory(@Query() q: ListDirectoryDto) {
    return this.svc.directory(q);
  }

  /** Inverse map `tenantId → apps[]` calculée depuis les attributs Keycloak. */
  @Get('directory/tenant-apps')
  tenantAppsMap() {
    return this.svc.tenantAppsMap();
  }
}
