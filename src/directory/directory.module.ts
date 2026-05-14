import { Module } from '@nestjs/common';
import { DirectoryController } from './directory.controller';
import { DirectoryService } from './directory.service';
import { KeycloakAdminService } from './keycloak-admin.service';
import { TenantsModule } from '../tenants/tenants.module';
import { IamModule } from '../iam/iam.module';

/**
 * Module Directory — vue agrégée des identités Keycloak côté HQ.
 *
 * Variables d'environnement attendues (mode dégradé si absentes) :
 *   - KEYCLOAK_ADMIN_BASE_URL     → ex. https://keycloak-dev-3f61.up.railway.app
 *   - KEYCLOAK_ADMIN_REALM        → realm d'auth admin (def. "master")
 *   - KEYCLOAK_ADMIN_CLIENT_ID    → client confidentiel
 *   - KEYCLOAK_ADMIN_CLIENT_SECRET
 *   - KEYCLOAK_TENANT_GROUP_PATH  → préfixe groupe tenant (def. "/tenants")
 *
 * Le client confidentiel doit avoir le rôle `realm-management/view-users`
 * (ou `realm-admin`) sur chacun des realms : realm-edu, realm-rh,
 * realm-sme, realm-internal.
 */
@Module({
  imports: [TenantsModule, IamModule],
  controllers: [DirectoryController],
  providers: [DirectoryService, KeycloakAdminService],
  exports: [DirectoryService],
})
export class DirectoryModule {}
