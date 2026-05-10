import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

const CHANNELS = ['whatsapp', 'email', 'in-app'] as const;

export class CreateBroadcastDto {
  @IsIn(CHANNELS as unknown as string[])
  channel!: (typeof CHANNELS)[number];

  @IsString()
  subject!: string;

  @IsString()
  body!: string;

  @IsArray()
  @IsString({ each: true })
  recipients!: string[];

  @IsOptional()
  @IsString()
  scheduledAt?: string;
}
