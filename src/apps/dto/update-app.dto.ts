import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';

const STATUSES = ['live', 'beta', 'mvp', 'dev', 'planned'] as const;

export class UpdateAppDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() tag?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() version?: string;
  @IsOptional() @IsIn(STATUSES as unknown as string[])
  status?: (typeof STATUSES)[number];
  @IsOptional() @IsArray() @IsString({ each: true })
  modules?: string[];
}
