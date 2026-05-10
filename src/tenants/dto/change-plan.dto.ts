import { IsString } from 'class-validator';

export class ChangePlanDto {
  @IsString()
  plan!: string;
}
