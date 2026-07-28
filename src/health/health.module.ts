import { Module } from '@nestjs/common';
import { NolaSdkModule } from '@nola-hq/nola-sdk';
import { AppsModule } from '../apps/apps.module';
import { PushModule } from '../push/push.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { IncidentAlertListener } from './incident-alert.listener';

/**
 * Health is a thin projection on top of the registry + a JetStream-backed
 * incident store. No local `health_entries` table — the legacy entity is
 * left in `entities.ts` so existing prod rows stay queryable, but the
 * service no longer reads or writes it.
 *
 * `IncidentAlertListener` is registered here so the bridge to nola-notify
 * boots alongside the projection — same NolaClient, same JetStream
 * stream.
 */
@Module({
  imports: [AppsModule, NolaSdkModule, PushModule],
  controllers: [HealthController],
  providers: [HealthService, IncidentAlertListener],
  exports: [HealthService],
})
export class HealthModule {}
