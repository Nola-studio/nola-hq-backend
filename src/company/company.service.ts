import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { BusinessUnit } from './business-unit.entity';
import { LegalEntity } from './legal-entity.entity';
import { Product } from './product.entity';
import { PROVISIONABLE_PRODUCT_CODES } from './company.constants';

export interface ProductSummary {
  id: string;
  code: string;
  name: string;
  businessUnitId: string;
  businessUnit: { id: string; code: string; name: string };
  isInternal: boolean;
  provisionable: boolean;
}

export interface BusinessUnitSummary {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  legalEntity: { code: string; name: string };
  productCount: number;
}

export interface BusinessUnitDetail extends BusinessUnitSummary {
  products: Array<{ code: string; name: string; isInternal: boolean }>;
}

export interface LegalEntitySummary {
  id: string;
  code: string;
  name: string;
  jurisdiction: string;
  taxRegime: string | null;
  registrationNumber: string | null;
}

@Injectable()
export class CompanyService {
  constructor(
    @InjectRepository(BusinessUnit) private readonly businessUnits: Repository<BusinessUnit>,
    @InjectRepository(LegalEntity) private readonly legalEntities: Repository<LegalEntity>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
  ) {}

  async listBusinessUnits(): Promise<BusinessUnitSummary[]> {
    const units = await this.businessUnits.find({ relations: ['legalEntity'], order: { code: 'ASC' } });
    const counts = await this.productCountsByUnit();
    return units.map((u) => this.toSummary(u, counts.get(u.id) ?? 0));
  }

  async findBusinessUnit(code: string): Promise<BusinessUnitDetail> {
    const unit = await this.businessUnits.findOne({ where: { code }, relations: ['legalEntity'] });
    if (!unit) throw new NotFoundException(`Business unit '${code}' introuvable`);
    const products = await this.products.find({ where: { businessUnitId: unit.id }, order: { code: 'ASC' } });
    return {
      ...this.toSummary(unit, products.length),
      products: products.map((p) => ({ code: p.code, name: p.name, isInternal: p.isInternal })),
    };
  }

  async listLegalEntities(): Promise<LegalEntitySummary[]> {
    const rows = await this.legalEntities.find({ order: { code: 'ASC' } });
    return rows.map((e) => ({
      id: e.id,
      code: e.code,
      name: e.name,
      jurisdiction: e.jurisdiction,
      taxRegime: e.taxRegime,
      registrationNumber: e.registrationNumber,
    }));
  }

  async listProducts(filter?: { isInternal?: boolean }): Promise<ProductSummary[]> {
    const where: FindOptionsWhere<Product> = {};
    if (filter?.isInternal !== undefined) {
      where.isInternal = filter.isInternal;
    }
    const rows = await this.products.find({
      where,
      relations: ['businessUnit'],
      order: { code: 'ASC' },
    });
    return rows.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      businessUnitId: p.businessUnitId,
      businessUnit: {
        id: p.businessUnit!.id,
        code: p.businessUnit!.code,
        name: p.businessUnit!.name,
      },
      isInternal: p.isInternal,
      provisionable: PROVISIONABLE_PRODUCT_CODES.has(p.code),
    }));
  }

  /** One grouped query for the whole table rather than a per-unit count — only three business units exist. */
  private async productCountsByUnit(): Promise<Map<string, number>> {
    const rows: Array<{ businessUnitId: string; count: string }> = await this.products
      .createQueryBuilder('p')
      .select('p.business_unit_id', 'businessUnitId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('p.business_unit_id')
      .getRawMany();
    return new Map(rows.map((r) => [r.businessUnitId, Number(r.count)]));
  }

  private toSummary(unit: BusinessUnit, productCount: number): BusinessUnitSummary {
    return {
      id: unit.id,
      code: unit.code,
      name: unit.name,
      isActive: unit.isActive,
      legalEntity: { code: unit.legalEntity!.code, name: unit.legalEntity!.name },
      productCount,
    };
  }
}
