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
}
