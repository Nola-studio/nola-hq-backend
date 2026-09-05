import { IsArray, IsBoolean, IsOptional, IsString, Length } from 'class-validator';

/** `code` and `businessUnitCode` are deliberately absent — immutable once created. */
export class UpdateProductDto {
  @IsOptional() @IsString() @Length(1, 160) name?: string;
  @IsOptional() @IsBoolean() isInternal?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) sourceAliases?: string[];
  @IsOptional() @IsBoolean() archived?: boolean;
  @IsOptional() @IsBoolean() isProvisionable?: boolean;
}
