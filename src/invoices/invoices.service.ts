import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice, InvoiceStatus } from './invoice.entity';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { ListInvoicesDto } from './dto/list-invoices.dto';
import type { PaginatedResult } from '../common/dto/pagination.dto';

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Invoice) private readonly repo: Repository<Invoice>,
  ) {}

  async list(query: ListInvoicesDto): Promise<PaginatedResult<Invoice>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const qb = this.repo.createQueryBuilder('i');
    if (query.tenant) qb.andWhere('i.tenant = :tenant', { tenant: query.tenant });
    if (query.status) qb.andWhere('i.status = :status', { status: query.status });
    if (query.method) qb.andWhere('i.method = :method', { method: query.method });
    qb.orderBy('i.issued', 'DESC');
    const total = await qb.getCount();
    const items = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();
    return { items, total, page, limit };
  }

  async findOne(id: string) {
    const inv = await this.repo.findOne({ where: { id } });
    if (!inv) throw new NotFoundException(`Facture ${id} introuvable`);
    return inv;
  }

  async create(dto: CreateInvoiceDto) {
    const id = dto.id ?? (await this.nextInvoiceId());
    if (await this.repo.findOne({ where: { id } })) {
      throw new BadRequestException(`Facture ${id} existe déjà`);
    }
    return this.repo.save(this.repo.create({ ...dto, id }));
  }

  async setStatus(id: string, status: InvoiceStatus, method?: string) {
    const inv = await this.findOne(id);
    inv.status = status;
    if (method) inv.method = method;
    return this.repo.save(inv);
  }

  async overdue() {
    return this.repo.find({
      where: [{ status: 'overdue' as InvoiceStatus }, { status: 'late' as InvoiceStatus }],
      order: { due: 'ASC' },
    });
  }

  async summary() {
    const all = await this.repo.find();
    const sum = (p: (i: Invoice) => boolean) =>
      all.filter(p).reduce((s, i) => s + i.amt, 0);
    return {
      total: all.length,
      paid_cdf: sum((i) => i.status === 'paid'),
      pending_cdf: sum((i) => i.status === 'pending'),
      late_cdf: sum((i) => i.status === 'late'),
      overdue_cdf: sum((i) => i.status === 'overdue'),
    };
  }

  private async nextInvoiceId() {
    const last = await this.repo
      .createQueryBuilder('i')
      .orderBy('i.id', 'DESC')
      .getOne();
    const year = new Date().getFullYear();
    if (!last) return `INV-${year}-0001`;
    const num = parseInt(last.id.split('-').pop() ?? '0', 10) || 0;
    return `INV-${year}-${String(num + 1).padStart(4, '0')}`;
  }
}
