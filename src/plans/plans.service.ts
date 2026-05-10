import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from './plan.entity';
import { FeatureMatrixRow } from './feature-matrix-row.entity';

@Injectable()
export class PlansService {
  constructor(
    @InjectRepository(Plan) private readonly plans: Repository<Plan>,
    @InjectRepository(FeatureMatrixRow)
    private readonly matrix: Repository<FeatureMatrixRow>,
  ) {}

  findAll() {
    return this.plans.find({ order: { priceCdf: 'ASC' } });
  }

  async findOne(id: string) {
    const p = await this.plans.findOne({ where: { id } });
    if (!p) throw new NotFoundException(`Plan ${id} introuvable`);
    return p;
  }

  matrixRows() {
    return this.matrix.find({ order: { id: 'ASC' } });
  }
}
