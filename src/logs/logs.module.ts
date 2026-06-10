import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NolaSdkModule } from '@nola-hq/nola-sdk';
import { LogEntry } from './log.entity';
import { LogsController } from './logs.controller';
import { LogsService } from './logs.service';
import { LogsIngestListener } from './logs-ingest.listener';

/**
 * Logs module — serves the "Logs & audit unifiés" screen and feeds it.
 * LogsIngestListener subscribes to the platform event streams HQ already
 * receives and persists them as log lines (the `logs` table has no other
 * producer). NolaSdkModule is global but re-imported for self-containment.
 */
@Module({
  imports: [TypeOrmModule.forFeature([LogEntry]), NolaSdkModule],
  controllers: [LogsController],
  providers: [LogsService, LogsIngestListener],
  exports: [LogsService],
})
export class LogsModule {}
