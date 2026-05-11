import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Local CRM augmentation for tenants. The canonical tenant data
 * (id/name/email/realm/lifecycleState/subscriptions) is owned by
 * nola-billing and fetched at read time via NATS commands. This table
 * only stores the operational/commercial fields that nola-hq cares about
 * and nola-billing doesn't model.
 *
 * Keyed by `tenantId` (matches `Tenant.externalId` on the billing side —
 * the stable Keycloak/business identifier, not the billing-internal UUID).
 */
@Entity('tenant_crm')
export class TenantCrm {
  @PrimaryColumn()
  tenantId!: string;

  @Column({ length: 2, nullable: true })
  country?: string | null;

  @Column({ nullable: true })
  city?: string | null;

  @Column({ nullable: true })
  owner?: string | null;

  @Column({ nullable: true })
  whatsapp?: string | null;

  @Column({ name: 'mobile_money', nullable: true })
  mobileMoney?: string | null;

  @Column({ type: 'integer', nullable: true })
  nps?: number | null;

  /** Free-form internal notes (HQ team scratch pad). */
  @Column({ type: 'text', nullable: true })
  notes?: string | null;
}
