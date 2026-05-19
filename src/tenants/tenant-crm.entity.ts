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
 *
 * Provisioning state (kcUserId / kelasiSchoolId / provisionedAt /
 * provisionError) lives here too — it tells the HQ console which
 * tenants were created from the Onboarding wizard (Phase 3) vs.
 * which arrived from self-signup or legacy import.
 */
@Entity('tenant_crm')
export class TenantCrm {
  @PrimaryColumn({ type: 'varchar' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 2, nullable: true })
  country?: string | null;

  @Column({ type: 'varchar', nullable: true })
  city?: string | null;

  @Column({ type: 'varchar', nullable: true })
  owner?: string | null;

  @Column({ type: 'varchar', nullable: true })
  whatsapp?: string | null;

  @Column({ type: 'varchar', name: 'mobile_money', nullable: true })
  mobileMoney?: string | null;

  @Column({ type: 'integer', nullable: true })
  nps?: number | null;

  /** Free-form internal notes (HQ team scratch pad). */
  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  // ── HQ-driven provisioning state (Phase 3) ────────────────────────

  /** Keycloak user id of the tenant owner, returned by kelasi-gateway. */
  @Column({ type: 'varchar', name: 'kc_user_id', nullable: true })
  kcUserId?: string | null;

  /** svc-admin school.id returned by the provisioning call. */
  @Column({ type: 'varchar', name: 'kelasi_school_id', nullable: true })
  kelasiSchoolId?: string | null;

  /** Owner email captured at onboarding (denormalized for the recovery view). */
  @Column({ type: 'varchar', name: 'owner_email', nullable: true })
  ownerEmail?: string | null;

  /** Mobile-money phone the owner will receive the first STK push on. */
  @Column({ type: 'varchar', name: 'mobile_money_phone', nullable: true })
  mobileMoneyPhone?: string | null;

  /** Set when the kelasi-gateway provisioning call succeeded. */
  @Column({ type: 'varchar', name: 'provisioned_at', nullable: true })
  provisionedAt?: string | null;

  /** Last provisioning error, surfaced in the tenant detail page so an
   *  operator can retry or escalate. Cleared on a successful retry. */
  @Column({ type: 'varchar', name: 'provision_error', nullable: true, length: 500 })
  provisionError?: string | null;
}
