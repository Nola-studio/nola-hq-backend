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

@Module({
  imports: [
    // Tenant canonical data is owned by nola-billing (read via NATS).
    // TenantCrm = local-only CRM augmentation (city/owner/nps/notes/etc.)
    // + the HQ-driven provisioning state (kcUserId, kelasiSchoolId,
    //   provisionedAt, provisionError).
    TypeOrmModule.forFeature([TenantCrm, Invoice, MomoEntry, Ticket, ActivityEvent]),
  ],
  controllers: [TenantsController],
  providers: [TenantsService, KelasiProvisionClient],
  exports: [TenantsService],
})
export class TenantsModule {}
