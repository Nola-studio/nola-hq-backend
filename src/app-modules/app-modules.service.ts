import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModuleEntity } from './app-module.entity';

@Injectable()
export class AppModulesService {
  constructor(
    @InjectRepository(AppModuleEntity)
    private readonly repo: Repository<AppModuleEntity>,
  ) {}

  findAll(app?: string) {
    if (app) return this.repo.find({ where: { app } });
    return this.repo.find();
  }

  async findOne(id: string) {
    const m = await this.repo.findOne({ where: { id } });
    if (!m) throw new NotFoundException(`Module ${id} introuvable`);
    return m;
  }

  async toggleDefault(id: string, value: boolean) {
    const m = await this.findOne(id);
    m.default = value;
    return this.repo.save(m);
  }

  async toggleBeta(id: string, value: boolean) {
    const m = await this.findOne(id);
    m.beta = value;
    return this.repo.save(m);
  }
}
