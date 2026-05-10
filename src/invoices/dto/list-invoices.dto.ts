import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class ListInvoicesDto extends PaginationDto {
  @IsOptional() @IsString() tenant?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() method?: string;
}
