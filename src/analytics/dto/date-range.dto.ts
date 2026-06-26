import { IsISO8601, IsOptional, Validate } from 'class-validator';
import type {
  ValidationArguments,
  ValidatorConstraintInterface,
} from 'class-validator';
import { ValidatorConstraint } from 'class-validator';

/**
 * Ensures `from <= to` when both are present. Compares the ISO strings as
 * dates; a malformed value is left to `@IsISO8601` to flag.
 */
@ValidatorConstraint({ name: 'fromBeforeTo', async: false })
export class FromBeforeToConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as DateRangeDto;
    if (!dto.from || !dto.to) return true;
    const from = Date.parse(dto.from);
    const to = Date.parse(dto.to);
    if (Number.isNaN(from) || Number.isNaN(to)) return true; // @IsISO8601 handles it
    return from <= to;
  }
  defaultMessage(): string {
    return 'from must be on or before to';
  }
}

/**
 * Reusable `?from=&to=` window for analytics endpoints. Both bounds are
 * optional ISO-8601 dates (date or datetime). When omitted the endpoint
 * returns its full/live data.
 */
export class DateRangeDto {
  @IsOptional()
  @IsISO8601({ strict: false }, { message: 'from must be an ISO-8601 date' })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: false }, { message: 'to must be an ISO-8601 date' })
  @Validate(FromBeforeToConstraint)
  to?: string;
}
