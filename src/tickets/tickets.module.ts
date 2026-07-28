import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NolaSdkModule } from '@nola-hq/nola-sdk';
import { Ticket } from './ticket.entity';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { SupportIngestListener } from './support-ingest.listener';
import { PushModule } from '../push/push.module';

@Module({
  imports: [TypeOrmModule.forFeature([Ticket]), NolaSdkModule, PushModule],
  controllers: [TicketsController],
  providers: [TicketsService, SupportIngestListener],
  exports: [TicketsService],
})
export class TicketsModule {}
