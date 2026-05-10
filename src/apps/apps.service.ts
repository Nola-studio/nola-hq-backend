import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppEntity, AppStatus } from './app.entity';

export interface UpdateAppDto {
  name?: string;
  tag?: string;
  color?: string;
  version?: string;
  status?: AppStatus;
  modules?: string[];
}

@Injectable()
export class AppsService {
  constructor(
    @InjectRepository(AppEntity) private readonly repo: Repository<AppEntity>,
  ) {}

  findAll() {
    return this.repo.find({ order: { mrrCdf: 'DESC' } });
  }

  async findOne(id: string) {
    const a = await this.repo.findOne({ where: { id } });
    if (!a) throw new NotFoundException(`App ${id} introuvable`);
    return a;
  }

  async update(id: string, dto: UpdateAppDto) {
    const app = await this.findOne(id);
    Object.assign(app, dto);
    return this.repo.save(app);
  }
}
