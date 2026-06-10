import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class ListMomoDto extends PaginationDto {
  /** Billing rail category: mobile_money / card / bank_transfer / stripe. */
  @IsOptional() @IsString() provider?: string;
  @IsOptional() @IsString() tenant?: string;
  /** Payment lifecycle status: pending / succeeded / failed / … */
  @IsOptional() @IsString() status?: string;
}
