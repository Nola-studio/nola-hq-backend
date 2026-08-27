import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NolaSdkModule } from '@nola-hq/nola-sdk';
import { Ticket } from './ticket.entity';
import { TicketEvent } from './ticket-event.entity';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { TicketsNotifyService } from './tickets-notify.service';
import { SupportIngestListener } from './support-ingest.listener';
import { PushModule } from '../push/push.module';
import { TeamMember } from '../team/team-member.entity';
import { CompanyModule } from '../company/company.module';

@Module({
  imports: [TypeOrmModule.forFeature([Ticket, TicketEvent, TeamMember]), NolaSdkModule, PushModule, CompanyModule],
  controllers: [TicketsController],
  providers: [TicketsService, TicketsNotifyService, SupportIngestListener],
  exports: [TicketsService],
})
export class TicketsModule {}
