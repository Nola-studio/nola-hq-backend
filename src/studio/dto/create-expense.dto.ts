import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';
import type {
  StudioExpenseCategory,
  StudioExpenseCurrency,
  StudioExpenseFrequency,
} from '../studio-expense.entity';
import { DATE_PATTERN } from './create-task.dto';

export const EXPENSE_CURRENCIES = ['CAD', 'USD', 'CDF', 'XAF'] as const;
export const EXPENSE_CATEGORIES = [
  'infra_hosting',
  'domains_saas',
  'legal_admin',
  'marketing',
  'travel',
  'other',
] as const;
export const EXPENSE_FREQUENCIES = ['monthly', 'yearly', 'one_time'] as const;

export class CreateExpenseDto {
  @IsString() @MinLength(1) description!: string;
  @IsInt() @Min(1) amountCents!: number;
  @IsIn(EXPENSE_CURRENCIES as unknown as string[]) currency!: StudioExpenseCurrency;
  @IsIn(EXPENSE_CATEGORIES as unknown as string[]) category!: StudioExpenseCategory;
  /** Team member's email — soft reference (`team_members.email`). */
  @IsEmail() paidByEmail!: string;
  @Matches(DATE_PATTERN) date!: string;
  @IsOptional() @IsBoolean() recurring?: boolean;
  @IsOptional() @IsIn(EXPENSE_FREQUENCIES as unknown as string[]) frequency?: StudioExpenseFrequency;
}
