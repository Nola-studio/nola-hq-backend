import { Module } from '@nestjs/common';
import { KelasiProxyController } from './kelasi-proxy.controller';
import { YekoliProvisionClient } from '../tenants/yekoli-provision.client';

/**
 * Server-side read proxy to kelasi-gateway. Reuses the HTTP client
 * the tenants module already has so we don't duplicate the env-var
 * resolution + error mapping.
 */
@Module({
  controllers: [KelasiProxyController],
  providers: [YekoliProvisionClient],
})
export class KelasiProxyModule {}
