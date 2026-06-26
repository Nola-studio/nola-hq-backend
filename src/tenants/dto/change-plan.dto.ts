import { IsOptional, IsString } from 'class-validator';

export class ChangePlanDto {
  /** Billing plan UUID or name (e.g. `kelasi:growth`). */
  @IsString()
  plan!: string;

  /**
   * Which app's subscription to re-plan. Optional when the tenant has a
   * single subscription (auto-resolved). Required when it has several —
   * otherwise the service rejects with `app_required` so the wrong product
   * is never re-planned silently.
   */
  @IsOptional()
  @IsString()
  app?: string;
}
