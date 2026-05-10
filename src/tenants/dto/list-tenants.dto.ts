import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

const TENANT_SORT_FIELDS = [
  'name',
  'country',
  'plan',
  'mrr_cdf',
  'users',
  'status',
  'since',
  'ar_days',
  'nps',
] as const;

export class ListTenantsDto extends PaginationDto {
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() plan?: string;
  @IsOptional() @IsString() app?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional()
  @IsIn(TENANT_SORT_FIELDS as unknown as string[])
  declare sort?: (typeof TENANT_SORT_FIELDS)[number];
}
