import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, Repository } from 'typeorm';
import { RoadmapInitiative } from '../roadmap/roadmap-initiative.entity';
import { WorkItem } from '../work-items/work-item.entity';
import { BusinessClient } from './business-client.entity';
import { BusinessContract } from './business-contract.entity';
import { BusinessDocument } from './business-document.entity';
import { BusinessExpense } from './business-expense.entity';
import { BusinessInvoice } from './business-invoice.entity';
import { BusinessOpportunity } from './business-opportunity.entity';
import { BusinessPdfService } from './business-pdf.service';
import { BusinessQuote, BusinessQuoteLine } from './business-quote.entity';
import { BusinessReminder } from './business-reminder.entity';
import { BusinessService } from './business.service';
import {
  CashflowQueryDto,
  ConvertQuoteToInvoiceDto,
  CreateBusinessDocumentDto,
  CreateBusinessQuoteDto,
  CreateBusinessReminderDto,
  CreateProjectTimeEntryDto,
  UpdateBusinessQuoteDto,
  UpdateBusinessReminderDto,
  UpdateProjectTimeEntryDto,
} from './dto/business-operations.dto';
import { ProjectTimeEntry } from './project-time-entry.entity';
import { DEFAULT_BUSINESS_CURRENCY } from './business-currency';
import { sumByCurrency } from './currency-totals';

@Injectable()
export class BusinessOperationsService {
  constructor(
    @InjectRepository(BusinessQuote) private readonly quotes: Repository<BusinessQuote>,
    @InjectRepository(BusinessQuoteLine) private readonly quoteLines: Repository<BusinessQuoteLine>,
    @InjectRepository(BusinessDocument) private readonly documents: Repository<BusinessDocument>,
    @InjectRepository(BusinessReminder) private readonly reminders: Repository<BusinessReminder>,
    @InjectRepository(ProjectTimeEntry) private readonly timeEntries: Repository<ProjectTimeEntry>,
    @InjectRepository(BusinessClient) private readonly clients: Repository<BusinessClient>,
    @InjectRepository(BusinessOpportunity) private readonly opportunities: Repository<BusinessOpportunity>,
    @InjectRepository(BusinessContract) private readonly contracts: Repository<BusinessContract>,
    @InjectRepository(BusinessInvoice) private readonly invoices: Repository<BusinessInvoice>,
    @InjectRepository(BusinessExpense) private readonly expenses: Repository<BusinessExpense>,
    @InjectRepository(RoadmapInitiative) private readonly projects: Repository<RoadmapInitiative>,
    @InjectRepository(WorkItem) private readonly workItems: Repository<WorkItem>,
    private readonly dataSource: DataSource,
    private readonly business: BusinessService,
    private readonly pdf: BusinessPdfService,
  ) {}

  private clean(value?: string | null) {
    return value?.trim() || null;
  }

  private makeNumber(prefix: string) {
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `${prefix}-${date}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }

  async listQuotes(projectId?: string) {
    const rows = await this.quotes.find({
      ...(projectId ? { where: { projectId } } : {}),
      relations: { client: true, project: true, opportunity: true, lines: true },
      order: { issuedOn: 'DESC', createdAt: 'DESC' },
    });
    return rows.map((row) => ({ ...row, lines: [...(row.lines ?? [])].sort((a, b) => a.position - b.position) }));
  }

  async findQuote(id: string) {
    const quote = await this.quotes.findOne({
      where: { id },
      relations: { client: true, project: true, opportunity: true, lines: true },
    });
    if (!quote) throw new NotFoundException(`Devis ${id} introuvable`);
    quote.lines = [...(quote.lines ?? [])].sort((a, b) => a.position - b.position);
    return quote;
  }

  private async assertQuoteLinks(clientId: string, projectId?: string | null, opportunityId?: string | null) {
    const client = await this.clients.findOne({ where: { id: clientId } });
    if (!client) throw new NotFoundException(`Client business ${clientId} introuvable`);
    if (projectId && !await this.projects.findOne({ where: { id: projectId } })) {
      throw new NotFoundException(`Projet ${projectId} introuvable`);
    }
    if (opportunityId) {
      const opportunity = await this.opportunities.findOne({ where: { id: opportunityId } });
      if (!opportunity) throw new NotFoundException(`Opportunité ${opportunityId} introuvable`);
      if (opportunity.clientId !== clientId) throw new BadRequestException('Le devis et l’opportunité doivent avoir le même client.');
      if (projectId && opportunity.projectId && projectId !== opportunity.projectId) {
        throw new BadRequestException('Le devis et l’opportunité doivent appartenir au même projet.');
      }
    }
  }

  private totals(lines: CreateBusinessQuoteDto['lines'], taxRate: number) {
    const normalized = lines.map((line, position) => ({
      description: line.description.trim(),
      quantity: line.quantity,
      unitPriceCdf: line.unitPriceCdf,
      totalCdf: Math.round(line.quantity * line.unitPriceCdf),
      position,
    }));
    const subtotalCdf = normalized.reduce((sum, line) => sum + line.totalCdf, 0);
    const taxCdf = Math.round(subtotalCdf * taxRate / 100);
    return { normalized, subtotalCdf, taxCdf, totalCdf: subtotalCdf + taxCdf };
  }

  async createQuote(dto: CreateBusinessQuoteDto) {
    await this.assertQuoteLinks(dto.clientId, dto.projectId, dto.opportunityId);
    if (dto.validUntil < dto.issuedOn) throw new BadRequestException('La validité du devis doit être postérieure à sa date d’émission.');
    const number = dto.number?.trim() || this.makeNumber('DEV');
    if (await this.quotes.findOne({ where: { number } })) throw new ConflictException(`Le devis ${number} existe déjà.`);
    const taxRate = dto.taxRate ?? 0;
    const computed = this.totals(dto.lines, taxRate);
    const now = new Date();
    const id = await this.dataSource.transaction(async (manager) => {
      const quotes = manager.getRepository(BusinessQuote);
      const lines = manager.getRepository(BusinessQuoteLine);
      const quote = await quotes.save(quotes.create({
        number,
        clientId: dto.clientId,
        projectId: dto.projectId ?? null,
        opportunityId: dto.opportunityId ?? null,
        title: dto.title.trim(),
        status: dto.status ?? 'draft',
        issuedOn: dto.issuedOn,
        validUntil: dto.validUntil,
        taxRate,
        subtotalCdf: computed.subtotalCdf,
        taxCdf: computed.taxCdf,
        totalCdf: computed.totalCdf,
        currency: dto.currency ?? DEFAULT_BUSINESS_CURRENCY,
        paymentTerms: this.clean(dto.paymentTerms),
        notes: this.clean(dto.notes),
        createdAt: now,
        updatedAt: now,
      }));
      await lines.save(computed.normalized.map((line) => lines.create({ ...line, quoteId: quote.id })));
      return quote.id;
    });
    return this.findQuote(id);
  }

  async updateQuote(id: string, dto: UpdateBusinessQuoteDto) {
    const quote = await this.findQuote(id);
    const clientId = dto.clientId ?? quote.clientId;
    const projectId = dto.projectId ?? quote.projectId;
    const opportunityId = dto.opportunityId ?? quote.opportunityId;
    await this.assertQuoteLinks(clientId, projectId, opportunityId);
    const issuedOn = dto.issuedOn ?? quote.issuedOn;
    const validUntil = dto.validUntil ?? quote.validUntil;
    if (validUntil < issuedOn) throw new BadRequestException('La validité du devis doit être postérieure à sa date d’émission.');
    if (dto.number && dto.number !== quote.number && await this.quotes.findOne({ where: { number: dto.number } })) {
      throw new ConflictException(`Le devis ${dto.number} existe déjà.`);
    }
    const linesInput = dto.lines ?? (quote.lines ?? []).map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPriceCdf: line.unitPriceCdf,
    }));
    const taxRate = dto.taxRate ?? quote.taxRate;
    const computed = this.totals(linesInput, taxRate);
    await this.dataSource.transaction(async (manager) => {
      const quoteRepo = manager.getRepository(BusinessQuote);
      const lineRepo = manager.getRepository(BusinessQuoteLine);
      const { lines: ignored, ...patch } = dto;
      void ignored;
      Object.assign(quote, patch, {
        clientId,
        projectId,
        opportunityId,
        taxRate,
        subtotalCdf: computed.subtotalCdf,
        taxCdf: computed.taxCdf,
        totalCdf: computed.totalCdf,
        updatedAt: new Date(),
      });
      if (dto.title !== undefined) quote.title = dto.title.trim();
      await quoteRepo.save(quote);
      if (dto.lines) {
        await lineRepo.delete({ quoteId: id });
        await lineRepo.save(computed.normalized.map((line) => lineRepo.create({ ...line, quoteId: id })));
      }
    });
    if (dto.status === 'accepted' && quote.opportunityId) {
      await this.opportunities.update(quote.opportunityId, { stage: 'won', probability: 100, updatedAt: new Date() });
    }
    return this.findQuote(id);
  }

  async convertQuote(id: string, dto: ConvertQuoteToInvoiceDto) {
    const quote = await this.findQuote(id);
    if (!quote.projectId) throw new BadRequestException('Associe le devis à un projet avant de créer la facture.');
    const invoice = await this.business.createInvoice({
      clientId: quote.clientId,
      projectId: quote.projectId,
      amountCdf: quote.totalCdf,
      currency: quote.currency,
      issuedOn: new Date().toISOString().slice(0, 10),
      dueOn: dto.dueOn,
      status: dto.status ?? 'draft',
      description: `${quote.title} — devis ${quote.number}`,
    });
    if (quote.status !== 'accepted') await this.updateQuote(id, { status: 'accepted' });
    return invoice;
  }

  async quotePdf(id: string) {
    return this.pdf.quote(await this.findQuote(id));
  }

  async invoicePdf(id: string) {
    const invoice = await this.invoices.findOne({
      where: { id },
      relations: { client: true, project: true, contract: true },
    });
    if (!invoice) throw new NotFoundException(`Facture business ${id} introuvable`);
    return this.pdf.invoice(invoice);
  }

  listDocuments(entityType?: BusinessDocument['entityType'], entityId?: string) {
    const where: FindOptionsWhere<BusinessDocument> = {};
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    return this.documents.find({ where, order: { createdAt: 'DESC' } });
  }

  private async assertDocumentTarget(type: BusinessDocument['entityType'], id: string) {
    const exists = type === 'client' ? await this.clients.exist({ where: { id } })
      : type === 'project' ? await this.projects.exist({ where: { id } })
        : type === 'contract' ? await this.contracts.exist({ where: { id } })
          : type === 'quote' ? await this.quotes.exist({ where: { id } })
            : await this.invoices.exist({ where: { id } });
    if (!exists) throw new NotFoundException(`${type} ${id} introuvable`);
  }

  async createDocument(dto: CreateBusinessDocumentDto, addedBy?: string) {
    await this.assertDocumentTarget(dto.entityType, dto.entityId);
    return this.documents.save(this.documents.create({
      entityType: dto.entityType,
      entityId: dto.entityId,
      name: dto.name.trim(),
      url: dto.url,
      mimeType: this.clean(dto.mimeType),
      kind: dto.kind?.trim() || 'other',
      addedBy: addedBy ?? null,
      createdAt: new Date(),
    }));
  }

  async removeDocument(id: string) {
    if (!await this.documents.exist({ where: { id } })) throw new NotFoundException(`Document ${id} introuvable`);
    await this.documents.delete(id);
    return { ok: true };
  }

  async listReminders(includeDone = false) {
    await this.syncAutomaticReminders();
    return this.reminders.find({
      ...(includeDone ? {} : { where: { status: 'pending' } }),
      order: { dueAt: 'ASC', createdAt: 'ASC' },
    });
  }

  async createReminder(dto: CreateBusinessReminderDto) {
    await this.assertReminderTarget(dto.entityType, dto.entityId);
    const now = new Date();
    return this.reminders.save(this.reminders.create({
      fingerprint: null,
      entityType: dto.entityType,
      entityId: dto.entityId,
      title: dto.title.trim(),
      dueAt: new Date(dto.dueAt),
      assignee: this.clean(dto.assignee),
      status: 'pending',
      automatic: false,
      note: this.clean(dto.note),
      createdAt: now,
      updatedAt: now,
    }));
  }

  async updateReminder(id: string, dto: UpdateBusinessReminderDto) {
    const reminder = await this.reminders.findOne({ where: { id } });
    if (!reminder) throw new NotFoundException(`Rappel ${id} introuvable`);
    Object.assign(reminder, dto);
    if (dto.dueAt) reminder.dueAt = new Date(dto.dueAt);
    reminder.updatedAt = new Date();
    return this.reminders.save(reminder);
  }

  private async assertReminderTarget(type: BusinessReminder['entityType'], id: string) {
    const exists = type === 'opportunity' ? await this.opportunities.exist({ where: { id } })
      : type === 'contract' ? await this.contracts.exist({ where: { id } })
        : type === 'quote' ? await this.quotes.exist({ where: { id } })
          : type === 'invoice' ? await this.invoices.exist({ where: { id } })
            : await this.projects.exist({ where: { id } });
    if (!exists) throw new NotFoundException(`${type} ${id} introuvable`);
  }

  private async syncAutomaticReminders() {
    const today = new Date().toISOString().slice(0, 10);
    const plusDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
    const [invoices, quotes, contracts] = await Promise.all([this.invoices.find(), this.quotes.find(), this.contracts.find()]);
    const active = new Set<string>();
    for (const invoice of invoices) {
      if (['paid', 'cancelled', 'draft'].includes(invoice.status) || invoice.dueOn > plusDays(7)) continue;
      const fingerprint = `invoice-due:${invoice.id}`;
      active.add(fingerprint);
      await this.upsertAutomatic(fingerprint, 'invoice', invoice.id, invoice.dueOn < today ? `Facture ${invoice.number} en retard` : `Facture ${invoice.number} bientôt à échéance`, invoice.dueOn);
    }
    for (const quote of quotes) {
      if (!['draft', 'sent'].includes(quote.status) || quote.validUntil > plusDays(7)) continue;
      const fingerprint = `quote-expiry:${quote.id}`;
      active.add(fingerprint);
      await this.upsertAutomatic(fingerprint, 'quote', quote.id, `Devis ${quote.number} arrive à expiration`, quote.validUntil);
    }
    for (const contract of contracts) {
      if (!contract.endDate || !['signed', 'active'].includes(contract.status) || contract.endDate > plusDays(14)) continue;
      const fingerprint = `contract-end:${contract.id}`;
      active.add(fingerprint);
      await this.upsertAutomatic(fingerprint, 'contract', contract.id, `Contrat ${contract.number} arrive à son terme`, contract.endDate);
    }
    const pendingAutomatic = await this.reminders.find({ where: { automatic: true, status: 'pending' } });
    const obsolete = pendingAutomatic.filter((item) => item.fingerprint && !active.has(item.fingerprint));
    if (obsolete.length) await this.reminders.save(obsolete.map((item) => Object.assign(item, { status: 'dismissed' as const, updatedAt: new Date() })));
  }

  private async upsertAutomatic(fingerprint: string, entityType: BusinessReminder['entityType'], entityId: string, title: string, date: string) {
    const existing = await this.reminders.findOne({ where: { fingerprint } });
    if (existing?.status === 'done' || existing?.status === 'dismissed') return;
    const now = new Date();
    const reminder = existing ?? this.reminders.create({
      fingerprint, entityType, entityId, status: 'pending', automatic: true,
      assignee: null, note: null, createdAt: now, updatedAt: now,
    });
    Object.assign(reminder, { title, dueAt: new Date(`${date}T09:00:00Z`), updatedAt: now });
    await this.reminders.save(reminder);
  }

  listTimeEntries(projectId?: string) {
    return this.timeEntries.find({
      ...(projectId ? { where: { projectId } } : {}),
      relations: { project: true, workItem: true },
      order: { workDate: 'DESC', createdAt: 'DESC' },
    });
  }

  async createTimeEntry(dto: CreateProjectTimeEntryDto) {
    await this.assertTimeLinks(dto.projectId, dto.workItemId);
    const now = new Date();
    return this.timeEntries.save(this.timeEntries.create({
      projectId: dto.projectId,
      workItemId: dto.workItemId ?? null,
      member: dto.member.trim(),
      workDate: dto.workDate,
      minutes: dto.minutes,
      billable: dto.billable ?? true,
      hourlyRateCdf: dto.hourlyRateCdf ?? 0,
      hourlyRateCurrency: dto.hourlyRateCurrency ?? DEFAULT_BUSINESS_CURRENCY,
      description: this.clean(dto.description),
      createdAt: now,
      updatedAt: now,
    }));
  }

  async updateTimeEntry(id: string, dto: UpdateProjectTimeEntryDto) {
    const entry = await this.timeEntries.findOne({ where: { id } });
    if (!entry) throw new NotFoundException(`Temps ${id} introuvable`);
    await this.assertTimeLinks(dto.projectId ?? entry.projectId, dto.workItemId ?? entry.workItemId ?? undefined);
    Object.assign(entry, dto, { updatedAt: new Date() });
    return this.timeEntries.save(entry);
  }

  async timeSummary(projectId?: string) {
    const rows = await this.listTimeEntries(projectId);
    const totalMinutes = rows.reduce((sum, row) => sum + row.minutes, 0);
    const billableMinutes = rows.filter((row) => row.billable).reduce((sum, row) => sum + row.minutes, 0);
    const laborCost = sumByCurrency(rows, (row) => ({
      amount: Math.round((row.minutes / 60) * row.hourlyRateCdf),
      currency: row.hourlyRateCurrency,
    }));
    return { totalMinutes, billableMinutes, nonBillableMinutes: totalMinutes - billableMinutes, laborCost, entries: rows.length };
  }

  private async assertTimeLinks(projectId: string, workItemId?: number) {
    if (!await this.projects.exist({ where: { id: projectId } })) throw new NotFoundException(`Projet ${projectId} introuvable`);
    if (workItemId) {
      const workItem = await this.workItems.findOne({ where: { id: workItemId } });
      if (!workItem) throw new NotFoundException(`Ticket interne ${workItemId} introuvable`);
      if (workItem.projectId !== projectId) throw new BadRequestException('Le temps et le ticket doivent appartenir au même projet.');
    }
  }

  async cashflow(query: CashflowQueryDto) {
    if (query.projectId && !await this.projects.exist({ where: { id: query.projectId } })) throw new NotFoundException(`Projet ${query.projectId} introuvable`);
    const months = query.months ?? 6;
    const startValue = query.from ?? new Date().toISOString().slice(0, 10);
    const start = new Date(`${startValue.slice(0, 7)}-01T00:00:00Z`);
    const buckets = Array.from({ length: months }, (_, index) => {
      const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1));
      return { month: date.toISOString().slice(0, 7), inflowCdf: 0, outflowCdf: 0, laborCostCdf: 0, netCdf: 0, cumulativeCdf: 0 };
    });
    const [invoices, expenses, time] = await Promise.all([
      this.invoices.find({ ...(query.projectId ? { where: { projectId: query.projectId } } : {}) }),
      this.expenses.find({ ...(query.projectId ? { where: { projectId: query.projectId } } : {}) }),
      this.timeEntries.find({ ...(query.projectId ? { where: { projectId: query.projectId } } : {}) }),
    ]);
    const bucket = (date: string) => {
      const key = date.slice(0, 7);
      if (key < buckets[0].month) return buckets[0];
      return buckets.find((item) => item.month === key);
    };
    for (const invoice of invoices.filter((item) => !['draft', 'cancelled'].includes(item.status))) {
      if (invoice.paidAmountCdf > 0) {
        const paidTarget = bucket(invoice.paidAt?.toISOString().slice(0, 10) ?? invoice.issuedOn);
        if (paidTarget) paidTarget.inflowCdf += invoice.paidAmountCdf;
      }
      const outstanding = Math.max(0, invoice.amountCdf - invoice.paidAmountCdf);
      const target = bucket(invoice.dueOn);
      if (target) target.inflowCdf += outstanding;
    }
    for (const expense of expenses.filter((item) => item.status !== 'rejected')) {
      const target = bucket(expense.incurredOn);
      if (target) target.outflowCdf += expense.amountCdf;
    }
    for (const entry of time) {
      const target = bucket(entry.workDate);
      if (target) target.laborCostCdf += Math.round(entry.minutes / 60 * entry.hourlyRateCdf);
    }
    let cumulative = 0;
    for (const item of buckets) {
      item.outflowCdf += item.laborCostCdf;
      item.netCdf = item.inflowCdf - item.outflowCdf;
      cumulative += item.netCdf;
      item.cumulativeCdf = cumulative;
    }
    return {
      from: buckets[0].month,
      months,
      projectId: query.projectId ?? null,
      totals: {
        inflowCdf: buckets.reduce((sum, item) => sum + item.inflowCdf, 0),
        outflowCdf: buckets.reduce((sum, item) => sum + item.outflowCdf, 0),
        netCdf: buckets.reduce((sum, item) => sum + item.netCdf, 0),
      },
      buckets,
    };
  }
}
