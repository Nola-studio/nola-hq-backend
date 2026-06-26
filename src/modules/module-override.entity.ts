import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Persisted HQ override for an app feature-module.
 *
 * Source of truth for the *catalogue* of modules is each app's manifest
 * (`AppsService` projection → `manifest.modules[]`, JetStream-backed). This
 * table is the **override layer** an operator edits from the HQ "Modules"
 * screen — exactly the pattern `plans` uses against nola-billing:
 *
 *   - Editing a module sets `manuallyEdited = true`. From then on the
 *     override wins over whatever the manifest declares, so a re-publish of
 *     the app manifest never silently reverts an operator's toggle.
 *   - `unlock` (PATCH body) clears `manuallyEdited` and removes the override
 *     fields, letting the manifest drive that module again.
 *   - A row with `manifestBacked = false` is a **custom** module created via
 *     `POST /modules` that has no manifest counterpart — it lives entirely
 *     here and is always surfaced.
 *
 * Composite identity is `(app, moduleId)`. The HQ API exposes a synthetic
 * `id = "<app>:<moduleId>"` so the frontend has a single addressable key.
 */
@Entity('module_overrides')
@Index(['app', 'moduleId'], { unique: true })
export class ModuleOverride {
  /** Synthetic stable id: `"<app>:<moduleId>"`. */
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column({ type: 'varchar' })
  @Index()
  app!: string;

  @Column({ type: 'varchar', name: 'module_id' })
  moduleId!: string;

  /** Operator-set display label override (falls back to the manifest name). */
  @Column({ type: 'varchar', nullable: true })
  label?: string | null;

  /** Whether the module is enabled by default for new tenants. */
  @Column({ type: 'boolean', name: 'is_default', nullable: true })
  default?: boolean | null;

  /** Whether the module is flagged beta. */
  @Column({ type: 'boolean', nullable: true })
  beta?: boolean | null;

  /**
   * Mirrors the `plans.manuallyEdited` lock: once an operator edits the
   * module the override takes precedence over the manifest until `unlock`.
   */
  @Column({ type: 'boolean', name: 'manually_edited', default: false })
  manuallyEdited!: boolean;

  /**
   * `true` when this override augments a module declared in the app
   * manifest; `false` for a custom module created entirely in the HQ.
   */
  @Column({ type: 'boolean', name: 'manifest_backed', default: true })
  manifestBacked!: boolean;

  @Column({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
