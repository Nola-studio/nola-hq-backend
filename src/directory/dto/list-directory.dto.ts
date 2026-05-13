import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListDirectoryDto {
  @IsOptional() @IsString() realm?: string;
  @IsOptional() @IsString() app?: string;
  @IsOptional() @IsString() tenantId?: string;
  @IsOptional() @IsString() q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
