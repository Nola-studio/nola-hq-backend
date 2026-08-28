import { IsArray, IsBoolean, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateProductDto {
  /** Natural key, immutable after creation, e.g. `yekoli`. */
  @IsString()
  @Length(1, 40)
  @Matches(/^[a-z0-9-]+$/, { message: 'code must be lowercase alphanumeric with dashes, e.g. yekoli' })
  code!: string;

  @IsString()
  @Length(1, 160)
  name!: string;

  /** Resolved server-side, same convention as `businessUnitCode` elsewhere. */
  @IsString()
  businessUnitCode!: string;

  @IsOptional() @IsBoolean() isInternal?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) sourceAliases?: string[];
}
