import { Module } from '@nestjs/common';
import { NolaSdkModule } from '@nola-hq/nola-sdk';
import { AppsModule } from '../apps/apps.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

/**
 * Health is a thin projection on top of the registry + a JetStream-backed
 * incident store. No local `health_entries` table — the legacy entity is
 * left in `entities.ts` so existing prod rows stay queryable, but the
 * service no longer reads or writes it.
 */
@Module({
  imports: [AppsModule, NolaSdkModule],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
