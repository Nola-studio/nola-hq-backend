import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NolaSdkModule } from '@nola-hq/nola-sdk';
import { Ticket } from './ticket.entity';
import { TicketEvent } from './ticket-event.entity';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { TicketsNotifyService } from './tickets-notify.service';
import { SupportIngestListener } from './support-ingest.listener';
import { TicketsSlaBreachScheduler } from './tickets-sla-breach.scheduler';
import { PushModule } from '../push/push.module';
import { TeamMember } from '../team/team-member.entity';
import { TeamModule } from '../team/team.module';
import { CompanyModule } from '../company/company.module';
import { SlaPolicy } from '../sla/sla-policy.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { Product } from '../company/product.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ticket, TicketEvent, TeamMember, SlaPolicy, Product]),
    NolaSdkModule,
    PushModule,
    CompanyModule,
    forwardRef(() => TeamModule),
    NotificationsModule,
  ],
  controllers: [TicketsController],
  providers: [TicketsService, TicketsNotifyService, SupportIngestListener, TicketsSlaBreachScheduler],
  exports: [TicketsService],
})
export class TicketsModule {}
