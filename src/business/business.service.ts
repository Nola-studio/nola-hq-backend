import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { RoadmapInitiative } from '../roadmap/roadmap-initiative.entity';
import { BusinessClient } from './business-client.entity';
import { BusinessContract } from './business-contract.entity';
import { BusinessExpense } from './business-expense.entity';
import { BusinessInvoice, type BusinessInvoiceStatus } from './business-invoice.entity';
import { BusinessOpportunity } from './business-opportunity.entity';
import { ProjectBudget } from './project-budget.entity';
import {
  CreateBusinessClientDto,
  CreateBusinessContractDto,
  CreateBusinessExpenseDto,
  CreateBusinessInvoiceDto,
  CreateBusinessOpportunityDto,
  UpdateBusinessClientDto,
  UpdateBusinessContractDto,
  UpdateBusinessExpenseDto,
  UpdateBusinessInvoiceDto,
  UpdateBusinessOpportunityDto,
  UpsertProjectBudgetDto,
} from './dto/business.dto';

@Injectable()
export class BusinessService {
  constructor(
    @InjectRepository(BusinessClient) private readonly clients: Repository<BusinessClient>,
    @InjectRepository(BusinessOpportunity) private readonly opportunities: Repository<BusinessOpportunity>,
    @InjectRepository(BusinessContract) private readonly contracts: Repository<BusinessContract>,
    @InjectRepository(ProjectBudget) private readonly budgets: Repository<ProjectBudget>,
    @InjectRepository(BusinessExpense) private readonly expenses: Repository<BusinessExpense>,
    @InjectRepository(BusinessInvoice) private readonly invoices: Repository<BusinessInvoice>,
    @InjectRepository(RoadmapInitiative) private readonly projects: Repository<RoadmapInitiative>,
  ) {}

  private clean(value?: string | null) {
    return value?.trim() || null;
  }

  private async client(id: string) {
    const client = await this.clients.findOne({ where: { id } });
    if (!client) throw new NotFoundException(`Client business ${id} introuvable`);
    return client;
  }

  private async project(id: string) {
    const project = await this.projects.findOne({ where: { id } });
    if (!project) throw new NotFoundException(`Projet ${id} introuvable`);
    return project;
  }

  private async contract(id: string) {
    const contract = await this.contracts.findOne({ where: { id } });
    if (!contract) throw new NotFoundException(`Contrat ${id} introuvable`);
    return contract;
  }

  private async assertOpportunity(opportunityId: string, clientId: string, projectId?: string | null) {
    const opportunity = await this.opportunities.findOne({ where: { id: opportunityId } });
    if (!opportunity) throw new NotFoundException(`Opportunité ${opportunityId} introuvable`);
    if (opportunity.clientId !== clientId) {
      throw new BadRequestException('Le contrat et l’opportunité doivent avoir le même client.');
    }
    if (projectId && opportunity.projectId && projectId !== opportunity.projectId) {
      throw new BadRequestException('Le contrat et l’opportunité doivent appartenir au même projet.');
    }
    return opportunity;
  }

  private assertDates(start?: string | null, end?: string | null, label = 'La date de fin') {
    if (start && end && end < start) {
      throw new BadRequestException(`${label} doit être postérieure à la date de début.`);
    }
  }

  private makeNumber(prefix: 'CTR' | 'FAC') {
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `${prefix}-${date}-${suffix}`;
  }

  listClients(status?: string) {
    return this.clients.find({
      ...(status ? { where: { status: status as BusinessClient['status'] } } : {}),
      order: { name: 'ASC' },
    });
  }

  async createClient(dto: CreateBusinessClientDto) {
    const now = new Date();
    return this.clients.save(this.clients.create({
      name: dto.name.trim(),
      status: dto.status ?? 'prospect',
      contactName: this.clean(dto.contactName),
      email: this.clean(dto.email)?.toLowerCase() ?? null,
      phone: this.clean(dto.phone),
      country: dto.country ?? null,
      city: this.clean(dto.city),
      owner: this.clean(dto.owner),
      notes: this.clean(dto.notes),
      createdAt: now,
      updatedAt: now,
    }));
  }

  async updateClient(id: string, dto: UpdateBusinessClientDto) {
    const client = await this.client(id);
    Object.assign(client, dto);
    if (dto.name !== undefined) client.name = dto.name.trim();
    if (dto.email !== undefined) client.email = this.clean(dto.email)?.toLowerCase() ?? null;
    client.updatedAt = new Date();
    return this.clients.save(client);
  }

  listOpportunities(filters: { clientId?: string; projectId?: string; stage?: string }) {
    const where: FindOptionsWhere<BusinessOpportunity> = {};
    if (filters.clientId) where.clientId = filters.clientId;
    if (filters.projectId) where.projectId = filters.projectId;
    if (filters.stage) where.stage = filters.stage as BusinessOpportunity['stage'];
    return this.opportunities.find({
      where,
      relations: { client: true, project: true },
      order: { updatedAt: 'DESC' },
    });
  }

  async opportunityBoard() {
    const items = await this.listOpportunities({});
    const labels: Record<BusinessOpportunity['stage'], string> = {
      lead: 'Lead', qualified: 'Qualifiée', proposal: 'Proposition',
      negotiation: 'Négociation', won: 'Gagnée', lost: 'Perdue',
    };
    return Object.entries(labels).map(([id, label]) => ({
      id,
      label,
      items: items.filter((item) => item.stage === id),
      totalCdf: items.filter((item) => item.stage === id).reduce((sum, item) => sum + item.valueCdf, 0),
    }));
  }

  async createOpportunity(dto: CreateBusinessOpportunityDto) {
    await this.client(dto.clientId);
    if (dto.projectId) await this.project(dto.projectId);
    const now = new Date();
    return this.opportunities.save(this.opportunities.create({
      clientId: dto.clientId,
      projectId: dto.projectId ?? null,
      title: dto.title.trim(),
      stage: dto.stage ?? 'lead',
      valueCdf: dto.valueCdf,
      probability: dto.probability ?? 10,
      expectedCloseDate: dto.expectedCloseDate ?? null,
      nextStep: this.clean(dto.nextStep),
      lossReason: this.clean(dto.lossReason),
      owner: this.clean(dto.owner),
      createdAt: now,
      updatedAt: now,
    }));
  }

  async updateOpportunity(id: string, dto: UpdateBusinessOpportunityDto) {
    const item = await this.opportunities.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Opportunité ${id} introuvable`);
    if (dto.clientId) await this.client(dto.clientId);
    if (dto.projectId) await this.project(dto.projectId);
    Object.assign(item, dto);
    if (dto.title !== undefined) item.title = dto.title.trim();
    item.updatedAt = new Date();
    return this.opportunities.save(item);
  }

  listContracts(filters: { clientId?: string; projectId?: string; status?: string }) {
    const where: FindOptionsWhere<BusinessContract> = {};
    if (filters.clientId) where.clientId = filters.clientId;
    if (filters.projectId) where.projectId = filters.projectId;
    if (filters.status) where.status = filters.status as BusinessContract['status'];
    return this.contracts.find({
      where,
      relations: { client: true, project: true, opportunity: true },
      order: { updatedAt: 'DESC' },
    });
  }

  async createContract(dto: CreateBusinessContractDto) {
    await this.client(dto.clientId);
    if (dto.projectId) await this.project(dto.projectId);
    if (dto.opportunityId) await this.assertOpportunity(dto.opportunityId, dto.clientId, dto.projectId);
    this.assertDates(dto.startDate, dto.endDate);
    const number = dto.number?.trim() || this.makeNumber('CTR');
    if (await this.contracts.findOne({ where: { number } })) throw new ConflictException(`Le contrat ${number} existe déjà.`);
    const now = new Date();
    return this.contracts.save(this.contracts.create({
      number,
      clientId: dto.clientId,
      projectId: dto.projectId ?? null,
      opportunityId: dto.opportunityId ?? null,
      title: dto.title.trim(),
      status: dto.status ?? 'draft',
      valueCdf: dto.valueCdf,
      startDate: dto.startDate ?? null,
      endDate: dto.endDate ?? null,
      signedAt: ['signed', 'active'].includes(dto.status ?? '') ? now : null,
      paymentTerms: this.clean(dto.paymentTerms),
      notes: this.clean(dto.notes),
      createdAt: now,
      updatedAt: now,
    }));
  }

  async updateContract(id: string, dto: UpdateBusinessContractDto) {
    const item = await this.contract(id);
    const clientId = dto.clientId ?? item.clientId;
    const projectId = dto.projectId ?? item.projectId;
    const opportunityId = dto.opportunityId ?? item.opportunityId;
    if (dto.clientId) await this.client(dto.clientId);
    if (dto.projectId) await this.project(dto.projectId);
    if (opportunityId) await this.assertOpportunity(opportunityId, clientId, projectId);
    this.assertDates(dto.startDate ?? item.startDate, dto.endDate ?? item.endDate);
    if (dto.number && dto.number !== item.number && await this.contracts.findOne({ where: { number: dto.number } })) {
      throw new ConflictException(`Le contrat ${dto.number} existe déjà.`);
    }
    const wasSigned = ['signed', 'active', 'completed'].includes(item.status);
    Object.assign(item, dto);
    if (!wasSigned && dto.status && ['signed', 'active', 'completed'].includes(dto.status)) item.signedAt = new Date();
    item.updatedAt = new Date();
    return this.contracts.save(item);
  }

  async getBudget(projectId: string) {
    await this.project(projectId);
    return this.budgets.findOne({ where: { projectId } });
  }

  async upsertBudget(projectId: string, dto: UpsertProjectBudgetDto) {
    await this.project(projectId);
    const now = new Date();
    const existing = await this.budgets.findOne({ where: { projectId } });
    return this.budgets.save(existing
      ? Object.assign(existing, dto, { updatedAt: now })
      : this.budgets.create({ projectId, ...dto, currency: 'CDF', createdAt: now, updatedAt: now }));
  }

  listExpenses(projectId?: string) {
    return this.expenses.find({
      ...(projectId ? { where: { projectId } } : {}),
      relations: { project: true, contract: true },
      order: { incurredOn: 'DESC', createdAt: 'DESC' },
    });
  }

  async createExpense(dto: CreateBusinessExpenseDto) {
    await this.project(dto.projectId);
    if (dto.contractId) {
      const contract = await this.contract(dto.contractId);
      if (contract.projectId && contract.projectId !== dto.projectId) throw new BadRequestException('La dépense et le contrat doivent appartenir au même projet.');
    }
    const now = new Date();
    return this.expenses.save(this.expenses.create({
      projectId: dto.projectId,
      contractId: dto.contractId ?? null,
      label: dto.label.trim(),
      category: dto.category?.trim() || 'other',
      amountCdf: dto.amountCdf,
      incurredOn: dto.incurredOn,
      vendor: this.clean(dto.vendor),
      status: dto.status ?? 'planned',
      notes: this.clean(dto.notes),
      createdAt: now,
      updatedAt: now,
    }));
  }

  async updateExpense(id: string, dto: UpdateBusinessExpenseDto) {
    const item = await this.expenses.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Dépense ${id} introuvable`);
    const projectId = dto.projectId ?? item.projectId;
    const contractId = dto.contractId ?? item.contractId;
    if (dto.projectId) await this.project(dto.projectId);
    if (contractId) {
      const contract = await this.contract(contractId);
      if (contract.projectId && contract.projectId !== projectId) {
        throw new BadRequestException('La dépense et le contrat doivent appartenir au même projet.');
      }
    }
    Object.assign(item, dto);
    item.updatedAt = new Date();
    return this.expenses.save(item);
  }

  async listInvoices(projectId?: string, clientId?: string) {
    const where: FindOptionsWhere<BusinessInvoice> = {};
    if (projectId) where.projectId = projectId;
    if (clientId) where.clientId = clientId;
    const rows = await this.invoices.find({
      where,
      relations: { client: true, project: true, contract: true },
      order: { issuedOn: 'DESC', createdAt: 'DESC' },
    });
    return rows.map((row) => ({ ...row, status: this.effectiveInvoiceStatus(row) }));
  }

  async createInvoice(dto: CreateBusinessInvoiceDto) {
    await Promise.all([this.client(dto.clientId), this.project(dto.projectId)]);
    if (dto.contractId) await this.assertInvoiceContract(dto.contractId, dto.clientId, dto.projectId);
    this.assertDates(dto.issuedOn, dto.dueOn, 'La date d’échéance');
    const paid = dto.paidAmountCdf ?? 0;
    if (paid > dto.amountCdf) throw new BadRequestException('Le montant payé ne peut pas dépasser le montant facturé.');
    const number = dto.number?.trim() || this.makeNumber('FAC');
    if (await this.invoices.findOne({ where: { number } })) throw new ConflictException(`La facture ${number} existe déjà.`);
    const now = new Date();
    const status = this.paymentStatus(dto.status ?? 'draft', dto.amountCdf, paid);
    return this.invoices.save(this.invoices.create({
      number,
      clientId: dto.clientId,
      projectId: dto.projectId,
      contractId: dto.contractId ?? null,
      amountCdf: dto.amountCdf,
      paidAmountCdf: paid,
      issuedOn: dto.issuedOn,
      dueOn: dto.dueOn,
      paidAt: status === 'paid' ? now : null,
      status,
      description: this.clean(dto.description),
      createdAt: now,
      updatedAt: now,
    }));
  }

  async updateInvoice(id: string, dto: UpdateBusinessInvoiceDto) {
    const item = await this.invoices.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Facture business ${id} introuvable`);
    const clientId = dto.clientId ?? item.clientId;
    const projectId = dto.projectId ?? item.projectId;
    const contractId = dto.contractId ?? item.contractId;
    if (dto.clientId) await this.client(dto.clientId);
    if (dto.projectId) await this.project(dto.projectId);
    if (contractId) await this.assertInvoiceContract(contractId, clientId, projectId);
    if (dto.number && dto.number !== item.number && await this.invoices.findOne({ where: { number: dto.number } })) {
      throw new ConflictException(`La facture ${dto.number} existe déjà.`);
    }
    const amount = dto.amountCdf ?? item.amountCdf;
    const paid = dto.paidAmountCdf ?? item.paidAmountCdf;
    if (paid > amount) throw new BadRequestException('Le montant payé ne peut pas dépasser le montant facturé.');
    this.assertDates(dto.issuedOn ?? item.issuedOn, dto.dueOn ?? item.dueOn, 'La date d’échéance');
    Object.assign(item, dto);
    item.status = this.paymentStatus(dto.status ?? item.status, amount, paid);
    item.paidAt = item.status === 'paid' ? item.paidAt ?? new Date() : null;
    item.updatedAt = new Date();
    return this.invoices.save(item);
  }

  private async assertInvoiceContract(contractId: string, clientId: string, projectId: string) {
    const contract = await this.contract(contractId);
    if (contract.clientId !== clientId) throw new BadRequestException('La facture et le contrat doivent avoir le même client.');
    if (contract.projectId && contract.projectId !== projectId) throw new BadRequestException('La facture et le contrat doivent appartenir au même projet.');
  }

  private paymentStatus(requested: BusinessInvoiceStatus, amount: number, paid: number): BusinessInvoiceStatus {
    if (paid >= amount && amount > 0) return 'paid';
    if (paid > 0) return 'partial';
    return requested === 'paid' || requested === 'partial' ? 'sent' : requested;
  }

  private effectiveInvoiceStatus(invoice: BusinessInvoice): BusinessInvoiceStatus {
    if (['paid', 'cancelled', 'draft'].includes(invoice.status)) return invoice.status;
    return invoice.dueOn < new Date().toISOString().slice(0, 10) ? 'overdue' : invoice.status;
  }

  async dashboard(projectId?: string) {
    if (projectId) await this.project(projectId);
    const [clients, opportunities, contracts, budgets, expenses, invoices] = await Promise.all([
      this.clients.find(),
      this.opportunities.find({ ...(projectId ? { where: { projectId } } : {}) }),
      this.contracts.find({ ...(projectId ? { where: { projectId } } : {}) }),
      this.budgets.find({ ...(projectId ? { where: { projectId } } : {}) }),
      this.expenses.find({ ...(projectId ? { where: { projectId } } : {}) }),
      this.invoices.find({ ...(projectId ? { where: { projectId } } : {}) }),
    ]);
    const openOpportunities = opportunities.filter((item) => !['won', 'lost'].includes(item.stage));
    const invoicedRows = invoices.filter((item) => item.status !== 'cancelled' && item.status !== 'draft');
    const actualExpenses = expenses.filter((item) => ['approved', 'paid'].includes(item.status));
    const sum = <T>(rows: T[], pick: (row: T) => number) => rows.reduce((total, row) => total + pick(row), 0);
    const invoicedCdf = sum(invoicedRows, (item) => item.amountCdf);
    const collectedCdf = sum(invoicedRows, (item) => item.paidAmountCdf);
    const expensesCdf = sum(actualExpenses, (item) => item.amountCdf);
    const netProfitCdf = invoicedCdf - expensesCdf;
    const today = new Date().toISOString().slice(0, 10);
    const relatedClientIds = new Set([
      ...opportunities.map((item) => item.clientId),
      ...contracts.map((item) => item.clientId),
      ...invoices.map((item) => item.clientId),
    ]);
    return {
      scope: projectId ? { projectId } : { projectId: null },
      totals: {
        clients: clients.filter((item) => item.status === 'active' && (!projectId || relatedClientIds.has(item.id))).length,
        openOpportunities: openOpportunities.length,
        pipelineCdf: sum(openOpportunities, (item) => item.valueCdf),
        weightedPipelineCdf: Math.round(sum(openOpportunities, (item) => item.valueCdf * item.probability / 100)),
        contractedCdf: sum(contracts.filter((item) => ['signed', 'active', 'completed'].includes(item.status)), (item) => item.valueCdf),
        revenueBudgetCdf: sum(budgets, (item) => item.revenueBudgetCdf),
        expenseBudgetCdf: sum(budgets, (item) => item.expenseBudgetCdf),
        invoicedCdf,
        collectedCdf,
        outstandingCdf: Math.max(0, invoicedCdf - collectedCdf),
        expensesCdf,
        netProfitCdf,
        marginPct: invoicedCdf ? Math.round((netProfitCdf / invoicedCdf) * 1_000) / 10 : 0,
        overdueInvoices: invoices.filter((item) => !['paid', 'cancelled', 'draft'].includes(item.status) && item.dueOn < today).length,
      },
      byStage: Object.fromEntries(
        ['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost'].map((stage) => [
          stage,
          opportunities.filter((item) => item.stage === stage).length,
        ]),
      ),
    };
  }

  async projectProfitability() {
    const [projects, budgets, contracts, expenses, invoices] = await Promise.all([
      this.projects.find({ order: { updatedAt: 'DESC' } }),
      this.budgets.find(),
      this.contracts.find(),
      this.expenses.find(),
      this.invoices.find(),
    ]);
    const sum = <T>(rows: T[], pick: (row: T) => number) => rows.reduce((total, row) => total + pick(row), 0);
    return projects.map((project) => {
      const budget = budgets.find((item) => item.projectId === project.id);
      const projectContracts = contracts.filter((item) => item.projectId === project.id && ['signed', 'active', 'completed'].includes(item.status));
      const projectInvoices = invoices.filter((item) => item.projectId === project.id && !['draft', 'cancelled'].includes(item.status));
      const projectExpenses = expenses.filter((item) => item.projectId === project.id && ['approved', 'paid'].includes(item.status));
      const invoicedCdf = sum(projectInvoices, (item) => item.amountCdf);
      const collectedCdf = sum(projectInvoices, (item) => item.paidAmountCdf);
      const expensesCdf = sum(projectExpenses, (item) => item.amountCdf);
      const netProfitCdf = invoicedCdf - expensesCdf;
      return {
        project: { id: project.id, title: project.title, status: project.status, owner: project.owner },
        revenueBudgetCdf: budget?.revenueBudgetCdf ?? 0,
        expenseBudgetCdf: budget?.expenseBudgetCdf ?? 0,
        contractedCdf: sum(projectContracts, (item) => item.valueCdf),
        invoicedCdf,
        collectedCdf,
        outstandingCdf: Math.max(0, invoicedCdf - collectedCdf),
        expensesCdf,
        netProfitCdf,
        marginPct: invoicedCdf ? Math.round((netProfitCdf / invoicedCdf) * 1_000) / 10 : 0,
      };
    });
  }
}
