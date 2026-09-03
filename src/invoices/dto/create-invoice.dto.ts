import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

const STATUSES = ['paid', 'pending', 'late', 'overdue'] as const;

export class CreateInvoiceDto {
  @IsOptional() @IsString() id?: string;
  @IsString() tenant!: string;
  @IsInt() @Min(0) amt!: number;
  @IsOptional() @IsString() currency?: string;
  @IsString() due!: string;
  @IsIn(STATUSES as unknown as string[])
  status!: (typeof STATUSES)[number];
  @IsString() method!: string;
  @IsString() issued!: string;
}
