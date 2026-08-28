import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantCrm } from './tenant-crm.entity';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { YekoliProvisionClient } from './yekoli-provision.client';
import { Invoice } from '../invoices/invoice.entity';
import { MomoEntry } from '../momo/momo-entry.entity';
import { ActivityEvent } from '../activity/activity.entity';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PlansModule } from '../plans/plans.module';
import { IamModule } from '../iam/iam.module';
import { TicketsModule } from '../tickets/tickets.module';

@Module({
  imports: [
    // Tenant canonical data is owned by nola-billing (read via NATS).
    // TenantCrm = local-only CRM augmentation (city/owner/nps/notes/etc.)
    // + the HQ-driven provisioning state (kcUserId, yekoliSchoolId,
    //   provisionedAt, provisionError).
    TypeOrmModule.forFeature([TenantCrm, Invoice, MomoEntry, ActivityEvent]),
    // change-plan / app-activation delegate to the canonical billing flow
    // owned by SubscriptionsService (NATS admin.subscription.*).
    SubscriptionsModule,
    // app-activation resolves the app's default plan from the canonical
    // billing catalogue (cheapest active plan) when none is passed.
    PlansModule,
    // tenant→org→memberships resolution for the Users tab (org id lives on
    // the canonical billing tenant; memberships come from nola-iam).
    IamModule,
    // detail()'s ticket list goes through TicketsService now, not a raw
    // Repository<Ticket> — no cycle: TicketsModule's own imports
    // (NolaSdkModule, PushModule, CompanyModule) never reach TenantsModule.
    TicketsModule,
  ],
  controllers: [TenantsController],
  providers: [TenantsService, YekoliProvisionClient],
  exports: [TenantsService],
})
export class TenantsModule {}
