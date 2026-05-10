import { IsIn, IsOptional, IsString } from 'class-validator';

const STATUSES = ['success', 'rolled-back'] as const;

export class CreateDeployDto {
  @IsOptional() @IsString() id?: string;
  @IsString() app!: string;
  @IsString() version!: string;
  @IsString() env!: string;
  @IsString() author!: string;
  @IsOptional() @IsString() t?: string;
  @IsOptional() @IsIn(STATUSES as unknown as string[])
  status?: (typeof STATUSES)[number];
  @IsString() sha!: string;
  @IsString() changelog!: string;
}
