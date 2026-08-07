import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import type { StudioExpenseCategory, StudioExpenseCurrency } from '../studio-expense.entity';
import { EXPENSE_CATEGORIES, EXPENSE_CURRENCIES } from './create-expense.dto';

export class ListExpensesDto {
  @IsOptional() @IsIn(EXPENSE_CATEGORIES as unknown as string[]) category?: StudioExpenseCategory;
  @IsOptional() @IsIn(EXPENSE_CURRENCIES as unknown as string[]) currency?: StudioExpenseCurrency;
  @IsOptional()
  @Type(() => Boolean)
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  recurring?: boolean;
}
