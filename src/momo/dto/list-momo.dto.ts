import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class ListMomoDto extends PaginationDto {
  @IsOptional() @IsString() provider?: string;
  @IsOptional() @IsString() tenant?: string;
  @IsOptional() @IsString() kind?: string;
}
