import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantCrm } from './tenant-crm.entity';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { KelasiProvisionClient } from './kelasi-provision.client';
import { Invoice } from '../invoices/invoice.entity';
import { MomoEntry } from '../momo/momo-entry.entity';
import { Ticket } from '../tickets/ticket.entity';
import { ActivityEvent } from '../activity/activity.entity';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PlansModule } from '../plans/plans.module';
import { IamModule } from '../iam/iam.module';

@Module({
  imports: [
    // Tenant canonical data is owned by nola-billing (read via NATS).
    // TenantCrm = local-only CRM augmentation (city/owner/nps/notes/etc.)
    // + the HQ-driven provisioning state (kcUserId, kelasiSchoolId,
    //   provisionedAt, provisionError).
    TypeOrmModule.forFeature([TenantCrm, Invoice, MomoEntry, Ticket, ActivityEvent]),
    // change-plan / app-activation delegate to the canonical billing flow
    // owned by SubscriptionsService (NATS admin.subscription.*).
    SubscriptionsModule,
    // app-activation resolves the app's default plan from the canonical
    // billing catalogue (cheapest active plan) when none is passed.
    PlansModule,
    // tenant→org→memberships resolution for the Users tab (org id lives on
    // the canonical billing tenant; memberships come from nola-iam).
    IamModule,
  ],
  controllers: [TenantsController],
  providers: [TenantsService, KelasiProvisionClient],
  exports: [TenantsService],
})
export class TenantsModule {}
