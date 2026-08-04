import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  PROJECT_RISK_LEVELS,
  PROJECT_RISK_STATUSES,
  type ProjectRiskLevel,
  type ProjectRiskStatus,
} from '../project-risk.entity';
import { WORK_SPRINT_STATUSES, type WorkSprintStatus } from '../work-sprint.entity';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreateWorkSprintDto {
  @IsUUID() projectId!: string;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(2_000) goal?: string;
  @IsOptional() @IsIn(WORK_SPRINT_STATUSES as unknown as string[]) status?: WorkSprintStatus;
  @IsOptional() @Matches(DATE_PATTERN) startDate?: string;
  @IsOptional() @Matches(DATE_PATTERN) endDate?: string;
}

export class UpdateWorkSprintDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(2_000) goal?: string | null;
  @IsOptional() @IsIn(WORK_SPRINT_STATUSES as unknown as string[]) status?: WorkSprintStatus;
  @IsOptional() @Matches(DATE_PATTERN) startDate?: string | null;
  @IsOptional() @Matches(DATE_PATTERN) endDate?: string | null;
}

export class AddWorkItemDependencyDto {
  @Type(() => Number) @IsInt() @Min(1) dependsOnId!: number;
}

export class CreateProjectRiskDto {
  @IsUUID() projectId!: string;
  @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(5_000) description?: string;
  @IsOptional() @IsIn(PROJECT_RISK_LEVELS as unknown as string[]) level?: ProjectRiskLevel;
  @IsOptional() @IsString() @MaxLength(160) owner?: string;
  @IsOptional() @IsString() @MaxLength(5_000) mitigation?: string;
}

export class UpdateProjectRiskDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(5_000) description?: string | null;
  @IsOptional() @IsIn(PROJECT_RISK_LEVELS as unknown as string[]) level?: ProjectRiskLevel;
  @IsOptional() @IsIn(PROJECT_RISK_STATUSES as unknown as string[]) status?: ProjectRiskStatus;
  @IsOptional() @IsString() @MaxLength(160) owner?: string | null;
  @IsOptional() @IsString() @MaxLength(5_000) mitigation?: string | null;
}
