import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudioRecurring } from './studio-recurring.entity';
import { CreateRecurringDto } from './dto/create-recurring.dto';
import { UpdateRecurringDto } from './dto/update-recurring.dto';

@Injectable()
export class StudioRecurringService {
  constructor(
    @InjectRepository(StudioRecurring)
    private readonly recurring: Repository<StudioRecurring>,
  ) {}

  async findAll(): Promise<StudioRecurring[]> {
    return this.recurring.find({ order: { service: 'ASC' } });
  }

  async findOne(id: string): Promise<StudioRecurring> {
    const row = await this.recurring.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Abonnement ${id} introuvable`);
    return row;
  }

  async create(dto: CreateRecurringDto): Promise<StudioRecurring> {
    const row = this.recurring.create({
      service: dto.service,
      purpose: dto.purpose ?? null,
      amount: dto.amount,
      cycle: dto.cycle,
      chargeDay: dto.chargeDay ?? null,
      paidByEmail: dto.paidByEmail ?? null,
      billingAccount: dto.billingAccount ?? null,
      createdAt: new Date(),
    });
    return this.recurring.save(row);
  }

  async update(id: string, dto: UpdateRecurringDto): Promise<StudioRecurring> {
    const row = await this.findOne(id);
    if (dto.service !== undefined) row.service = dto.service;
    if (dto.purpose !== undefined) row.purpose = dto.purpose;
    if (dto.amount !== undefined) row.amount = dto.amount;
    if (dto.cycle !== undefined) row.cycle = dto.cycle;
    if (dto.chargeDay !== undefined) row.chargeDay = dto.chargeDay;
    if (dto.paidByEmail !== undefined) row.paidByEmail = dto.paidByEmail;
    if (dto.billingAccount !== undefined) row.billingAccount = dto.billingAccount;
    return this.recurring.save(row);
  }

  async remove(id: string): Promise<void> {
    const row = await this.findOne(id);
    await this.recurring.remove(row);
  }
}
