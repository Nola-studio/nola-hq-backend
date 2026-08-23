import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessUnit } from './business-unit.entity';

/** Default business unit for creates that don't specify one explicitly. */
export const DEFAULT_BUSINESS_UNIT_CODE = 'khi-lab';

/**
 * Resolves a `BusinessUnit.code` to its `id`. Only three rows exist today,
 * so this caches the whole table rather than anything fancier — correctness
 * over cleverness. A miss reloads once (covers a unit added after boot)
 * before concluding the code is genuinely unknown.
 */
@Injectable()
export class BusinessUnitResolverService {
  private cache: Map<string, string> | null = null;

  constructor(
    @InjectRepository(BusinessUnit)
    private readonly repo: Repository<BusinessUnit>,
  ) {}

  /** Throws `BadRequestException` listing valid codes — never a silent fallback. */
  async resolve(code: string): Promise<string> {
    let map = await this.load();
    if (!map.has(code)) {
      this.cache = null;
      map = await this.load();
    }
    const id = map.get(code);
    if (!id) {
      const validCodes = [...map.keys()].sort().join(', ');
      throw new BadRequestException(`Unknown business unit code '${code}'. Valid codes: ${validCodes}`);
    }
    return id;
  }

  private async load(): Promise<Map<string, string>> {
    if (this.cache) return this.cache;
    const rows = await this.repo.find();
    this.cache = new Map(rows.map((r) => [r.code, r.id]));
    return this.cache;
  }
}
