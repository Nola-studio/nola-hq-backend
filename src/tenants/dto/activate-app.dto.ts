import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Body for `POST /tenants/:id/apps` — activate (provision) an app on an
 * existing tenant.
 */
export class ActivateAppDto {
  /** App/product key, e.g. `kelasi`, `kriver`. */
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  app!: string;

  /**
   * Optional plan (UUID or name) to start the new subscription on. When
   * omitted, billing picks the app's default plan.
   */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  plan?: string;
}
