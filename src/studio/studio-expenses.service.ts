import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { StudioExpense } from './studio-expense.entity';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ListExpensesDto } from './dto/list-expenses.dto';
import { toCsv } from './studio.expenses';

/** Internal team spend. Totals stay per-currency everywhere — never converted. */
@Injectable()
export class StudioExpensesService {
  constructor(
    @InjectRepository(StudioExpense)
    private readonly expenses: Repository<StudioExpense>,
  ) {}

  async findAll(filter: ListExpensesDto = {}): Promise<StudioExpense[]> {
    const where: FindOptionsWhere<StudioExpense> = {};
    if (filter.category) where.category = filter.category;
    if (filter.currency) where.currency = filter.currency;
    if (filter.recurring !== undefined) where.recurring = filter.recurring;

    return this.expenses.find({ where, order: { date: 'DESC', createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<StudioExpense> {
    const expense = await this.expenses.findOne({ where: { id } });
    if (!expense) throw new NotFoundException(`Dépense ${id} introuvable`);
    return expense;
  }

  async create(dto: CreateExpenseDto): Promise<StudioExpense> {
    const expense = this.expenses.create({
      description: dto.description,
      amountCents: dto.amountCents,
      currency: dto.currency,
      category: dto.category,
      paidByEmail: dto.paidByEmail,
      date: dto.date,
      recurring: dto.recurring ?? false,
      frequency: dto.frequency ?? null,
      status: dto.status ?? 'paid',
      workspace: dto.workspace ?? null,
      billingEmail: dto.billingEmail ?? null,
      paymentMethod: dto.paymentMethod ?? null,
      createdAt: new Date(),
    });
    return this.expenses.save(expense);
  }

  async update(id: string, dto: UpdateExpenseDto): Promise<StudioExpense> {
    const expense = await this.findOne(id);
    if (dto.description !== undefined) expense.description = dto.description;
    if (dto.amountCents !== undefined) expense.amountCents = dto.amountCents;
    if (dto.currency !== undefined) expense.currency = dto.currency;
    if (dto.category !== undefined) expense.category = dto.category;
    if (dto.paidByEmail !== undefined) expense.paidByEmail = dto.paidByEmail;
    if (dto.date !== undefined) expense.date = dto.date;
    if (dto.recurring !== undefined) expense.recurring = dto.recurring;
    if (dto.frequency !== undefined) expense.frequency = dto.frequency;
    if (dto.status !== undefined) expense.status = dto.status;
    if (dto.workspace !== undefined) expense.workspace = dto.workspace;
    if (dto.billingEmail !== undefined) expense.billingEmail = dto.billingEmail;
    if (dto.paymentMethod !== undefined) expense.paymentMethod = dto.paymentMethod;
    return this.expenses.save(expense);
  }

  async remove(id: string): Promise<void> {
    const expense = await this.findOne(id);
    await this.expenses.remove(expense);
  }

  async exportCsv(): Promise<string> {
    const rows = await this.expenses.find({ order: { date: 'DESC' } });
    return toCsv(rows);
  }

  /**
   * Generates concrete monthly expense rows from active recurring templates
   * for the given target month (YYYY-MM-DD, defaults to current date).
   * Avoids creating duplicates if an instance for that template already exists for that month.
   */
  async generateMonthlyRecurring(
    targetDateStr?: string,
  ): Promise<{ generated: StudioExpense[]; count: number; skipped: number }> {
    const today = new Date().toISOString().slice(0, 10);
    const targetDate = targetDateStr || today;
    const targetMonth = targetDate.slice(0, 7); // 'YYYY-MM'

    // Find all recurring templates
    const templates = await this.expenses.find({ where: { recurring: true } });
    const allMonthExpenses = await this.expenses.find();
    const thisMonthExpenses = allMonthExpenses.filter(
      (e) => e.date && e.date.startsWith(targetMonth),
    );

    const created: StudioExpense[] = [];
    let skipped = 0;

    for (const t of templates) {
      // Check if this template was already accounted for in this month:
      // 1. If the template's own date is in the target month (e.g. newly created this month)
      // 2. Or if a child instance with templateId === t.id already exists in this month
      // 3. Or matching description & category with templateId in this month
      const alreadyExists = thisMonthExpenses.some(
        (e) =>
          (e.id === t.id && e.date.startsWith(targetMonth)) ||
          e.templateId === t.id ||
          (e.description === t.description &&
            e.category === t.category &&
            e.amountCents === t.amountCents &&
            e.id !== t.id),
      );

      if (alreadyExists) {
        skipped++;
        continue;
      }

      // Preserve day of month from template date if valid, else clamp
      const day = t.date ? t.date.slice(8, 10) : '01';
      const expenseDate = `${targetMonth}-${day}`;

      const instance = this.expenses.create({
        description: t.description,
        amountCents: t.amountCents,
        currency: t.currency,
        category: t.category,
        paidByEmail: t.paidByEmail,
        date: expenseDate,
        recurring: false,
        frequency: t.frequency,
        status: 'paid',
        workspace: t.workspace,
        billingEmail: t.billingEmail,
        paymentMethod: t.paymentMethod,
        templateId: t.id,
        createdAt: new Date(),
      });

      const saved = await this.expenses.save(instance);
      created.push(saved);
    }

    return {
      generated: created,
      count: created.length,
      skipped,
    };
  }
}
