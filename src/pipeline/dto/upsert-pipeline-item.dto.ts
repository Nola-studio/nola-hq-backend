import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

const STAGES = ['prospect', 'demo', 'trial', 'signed', 'onboarded'] as const;

export class UpsertPipelineItemDto {
  @IsOptional() @IsString() id?: string;
  @IsString() name!: string;
  @IsString() @Length(2, 2) country!: string;
  @IsInt() @Min(0) amt!: number;
  @IsString() owner!: string;
  @IsOptional() @IsString() age?: string;
  @IsIn(STAGES as unknown as string[])
  stage!: (typeof STAGES)[number];
}

export class MoveStageDto {
  @IsIn(STAGES as unknown as string[])
  stage!: (typeof STAGES)[number];
}
