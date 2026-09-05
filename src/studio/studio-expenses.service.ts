import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { StudioExpense } from './studio-expense.entity';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ListExpensesDto } from './dto/list-expenses.dto';
import { toCsv } from './studio.expenses';

export interface CreateExpenseResult {
  expense: StudioExpense;
  duplicateWarning?: string;
}

/** Internal team spend. Totals stay per-currency everywhere — never converted. */
@Injectable()
export class StudioExpensesService {
  private readonly logger = new Logger(StudioExpensesService.name);

  constructor(
    @InjectRepository(StudioExpense)
    private readonly expenses: Repository<StudioExpense>,
    private readonly config: ConfigService,
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

  async create(dto: CreateExpenseDto): Promise<CreateExpenseResult> {
    let duplicateWarning: string | undefined;

    // Soft duplicate check against settled external invoices
    if (dto.source !== 'railway') {
      const existingRailway = await this.expenses.find({ where: { source: 'railway' } });
      const inputDate = new Date(dto.date).getTime();
      const matched = existingRailway.find((e) => {
        const diffDays = Math.abs(new Date(e.date).getTime() - inputDate) / (1000 * 60 * 60 * 24);
        const diffAmount = Math.abs(e.amountCents - dto.amountCents) / dto.amountCents;
        return diffDays <= 5 && diffAmount <= 0.05;
      });

      if (matched) {
        duplicateWarning = `Une facture Railway similaire existe déjà pour ce montant ($${(matched.amountCents / 100).toFixed(2)} le ${matched.date}, ref: ${matched.externalInvoiceId || matched.id}).`;
        this.logger.warn(`Potential duplicate expense: ${duplicateWarning}`);
      }
    }

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
      source: dto.source || 'manual',
      externalInvoiceId: dto.externalInvoiceId || null,
      receiptUrl: dto.receiptUrl || null,
      createdAt: new Date(),
    });

    const saved = await this.expenses.save(expense);
    return {
      expense: saved,
      duplicateWarning,
    };
  }

  async update(id: string, dto: UpdateExpenseDto): Promise<StudioExpense> {
    const expense = await this.findOne(id);

    if (expense.source === 'railway') {
      throw new ForbiddenException(
        'Les dépenses synchronisées depuis Railway sont vérifiées et ne peuvent pas être modifiées manuellement.',
      );
    }

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

    if (expense.source === 'railway') {
      throw new ForbiddenException(
        'Les dépenses synchronisées depuis Railway ne peuvent pas être supprimées manuellement.',
      );
    }

    await this.expenses.remove(expense);
  }

  async exportCsv(): Promise<string> {
    const rows = await this.expenses.find({ order: { date: 'DESC' } });
    return toCsv(rows);
  }

  /**
   * Syncs settled paid invoices from Railway API into studio_expenses.
   * Updates recurring template forecast using a rolling average of the last 3 settled invoices.
   */
  async syncRailwayInvoices(tokenOverride?: string): Promise<{
    workspaceName: string;
    syncedInvoicesCount: number;
    rollingAverageForecastUsd: number;
    forecastBasis: Array<{ invoiceId: string; date: string; amountUsd: number }>;
  }> {
    const token = tokenOverride || this.config.get<string>('RAILWAY_TOKEN') || process.env.RAILWAY_TOKEN;
    if (!token) {
      throw new Error('RAILWAY_TOKEN non configuré pour la synchronisation des factures.');
    }

    const endpoint = 'https://backboard.railway.app/graphql/v2';
    const mainQuery = `
      query GetWorkspaceInvoices {
        apiToken {
          workspaces {
            id
            name
          }
        }
      }
    `;

    const resMain = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query: mainQuery }),
    });

    const jsonMain: any = await resMain.json();
    const ws = jsonMain.data?.apiToken?.workspaces?.[0];
    if (!ws) {
      throw new Error('Impossible de résoudre le workspace Railway.');
    }

    const wsId = ws.id;
    const wsName = ws.name;

    const invoicesQuery = `
      query GetInvoices($wsId: String!) {
        workspace(workspaceId: $wsId) {
          customer {
            billingEmail
            invoices {
              invoiceId
              amountPaid
              status
              periodStart
              pdfURL
            }
          }
        }
      }
    `;

    const resInvoices = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query: invoicesQuery, variables: { wsId } }),
    });

    const jsonInvoices: any = await resInvoices.json();
    const customer = jsonInvoices.data?.workspace?.customer;
    const rawInvoices = customer?.invoices || [];
    const billingEmail = customer?.billingEmail || 'greg@nola.cd';

    // Settled, paid invoices only
    const settledInvoices = rawInvoices.filter((inv: any) => inv.status === 'paid' && inv.amountPaid > 0);

    // Find or create recurring template for this workspace
    let template = await this.expenses.findOne({
      where: {
        recurring: true,
        workspace: `${wsName} (Railway)`,
      },
    });

    if (!template) {
      template = await this.expenses.findOne({
        where: {
          recurring: true,
          description: `Railway Pro (${wsName})`,
        },
      });
    }

    if (!template) {
      template = this.expenses.create({
        description: `Railway Pro (${wsName})`,
        amountCents: 4800, // Placeholder until updated by rolling average
        currency: 'USD',
        category: 'infra_hosting',
        paidByEmail: billingEmail,
        date: new Date().toISOString().slice(0, 10),
        recurring: true,
        frequency: 'monthly',
        status: 'paid',
        workspace: `${wsName} (Railway)`,
        billingEmail,
        paymentMethod: 'Railway Stripe Billing',
        source: 'railway',
        createdAt: new Date(),
      });
      template = await this.expenses.save(template);
    }

    let syncedCount = 0;
    for (const inv of settledInvoices) {
      const externalId = inv.invoiceId;
      const amountCents = inv.amountPaid;
      const invoiceDate = inv.periodStart ? inv.periodStart.slice(0, 10) : new Date().toISOString().slice(0, 10);
      const pdfUrl = inv.pdfURL || null;

      let existing = await this.expenses.findOne({ where: { externalInvoiceId: externalId } });
      if (!existing) {
        existing = this.expenses.create({
          description: `Railway Pro (${wsName}) - Facture ${externalId}`,
          amountCents,
          currency: 'USD',
          category: 'infra_hosting',
          paidByEmail: billingEmail,
          date: invoiceDate,
          recurring: false,
          frequency: null,
          status: 'paid',
          workspace: `${wsName} (Railway)`,
          billingEmail,
          paymentMethod: 'Railway Stripe Billing',
          templateId: template.id,
          source: 'railway',
          externalInvoiceId: externalId,
          receiptUrl: pdfUrl,
          createdAt: new Date(),
        });
        await this.expenses.save(existing);
        syncedCount++;
      }
    }

    // Compute rolling average of the last 3 settled invoices
    const sortedSettled = [...settledInvoices].sort((a: any, b: any) => {
      return new Date(b.periodStart).getTime() - new Date(a.periodStart).getTime();
    });

    const top3 = sortedSettled.slice(0, 3);
    const sumCents = top3.reduce((acc: number, inv: any) => acc + inv.amountPaid, 0);
    const avgCents = top3.length > 0 ? Math.round(sumCents / top3.length) : template.amountCents;

    const forecastBasis = top3.map((inv: any) => ({
      invoiceId: inv.invoiceId,
      date: inv.periodStart ? inv.periodStart.slice(0, 10) : '',
      amountUsd: Number((inv.amountPaid / 100).toFixed(2)),
    }));

    template.amountCents = avgCents;
    template.forecastBasis = forecastBasis;
    template.source = 'railway';
    await this.expenses.save(template);

    return {
      workspaceName: wsName,
      syncedInvoicesCount: syncedCount,
      rollingAverageForecastUsd: Number((avgCents / 100).toFixed(2)),
      forecastBasis,
    };
  }

  /**
   * Generates concrete monthly expense rows from active recurring templates.
   */
  async generateMonthlyRecurring(
    targetDateStr?: string,
  ): Promise<{ generated: StudioExpense[]; count: number; skipped: number }> {
    const today = new Date().toISOString().slice(0, 10);
    const targetDate = targetDateStr || today;
    const targetMonth = targetDate.slice(0, 7);

    const templates = await this.expenses.find({ where: { recurring: true } });
    const allMonthExpenses = await this.expenses.find();
    const thisMonthExpenses = allMonthExpenses.filter(
      (e) => e.date && e.date.startsWith(targetMonth),
    );

    const created: StudioExpense[] = [];
    let skipped = 0;

    for (const t of templates) {
      // Don't generate duplicate instance if template is synced from live external invoices
      if (t.source === 'railway') {
        skipped++;
        continue;
      }

      const alreadyExists = thisMonthExpenses.some(
        (e) => (e.id === t.id && e.date.startsWith(targetMonth)) || e.templateId === t.id,
      );

      if (alreadyExists) {
        skipped++;
        continue;
      }

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
        source: t.source || 'manual',
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
