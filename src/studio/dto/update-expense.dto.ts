import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';
import type {
  StudioExpenseCategory,
  StudioExpenseCurrency,
  StudioExpenseFrequency,
} from '../studio-expense.entity';
import { DATE_PATTERN } from './create-task.dto';
import { EXPENSE_CATEGORIES, EXPENSE_CURRENCIES, EXPENSE_FREQUENCIES } from './create-expense.dto';

export class UpdateExpenseDto {
  @IsOptional() @IsString() @MinLength(1) description?: string;
  @IsOptional() @IsInt() @Min(1) amountCents?: number;
  @IsOptional() @IsIn(EXPENSE_CURRENCIES as unknown as string[]) currency?: StudioExpenseCurrency;
  @IsOptional() @IsIn(EXPENSE_CATEGORIES as unknown as string[]) category?: StudioExpenseCategory;
  @IsOptional() @IsEmail() paidByEmail?: string;
  @IsOptional() @Matches(DATE_PATTERN) date?: string;
  @IsOptional() @IsBoolean() recurring?: boolean;
  @IsOptional() @IsIn(EXPENSE_FREQUENCIES as unknown as string[]) frequency?: StudioExpenseFrequency;
}
