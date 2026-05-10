import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

const PROVIDERS = ['M-Pesa', 'Airtel', 'Orange', 'Wave', 'MTN'] as const;
const KINDS = ['in', 'payout'] as const;

export class CreateMomoDto {
  @IsString() ts!: string;
  @IsIn(PROVIDERS as unknown as string[])
  provider!: (typeof PROVIDERS)[number];
  @IsOptional() @IsString() tenant?: string | null;
  @IsInt() @Min(0) amt!: number;
  @IsIn(KINDS as unknown as string[])
  kind!: (typeof KINDS)[number];
  @IsString() ref!: string;
}
