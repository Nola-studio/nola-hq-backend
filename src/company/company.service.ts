import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { BusinessUnit } from './business-unit.entity';
import { LegalEntity } from './legal-entity.entity';
import { Product } from './product.entity';
import { PROVISIONABLE_PRODUCT_CODES } from './company.constants';
import { BusinessUnitResolverService } from './business-unit-resolver.service';
import { CreateBusinessUnitDto } from './dto/create-business-unit.dto';
import { UpdateBusinessUnitDto } from './dto/update-business-unit.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

export interface ProductSummary {
  id: string;
  code: string;
  name: string;
  businessUnitId: string;
  businessUnit: { id: string; code: string; name: string };
  isInternal: boolean;
  archived: boolean;
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
    private readonly businessUnitResolver: BusinessUnitResolverService,
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

  async createBusinessUnit(dto: CreateBusinessUnitDto): Promise<BusinessUnitDetail> {
    const existing = await this.businessUnits.findOne({ where: { code: dto.code } });
    if (existing) throw new ConflictException(`Business unit '${dto.code}' existe déjà`);
    const legalEntity = await this.legalEntities.findOne({ where: { code: dto.legalEntityCode } });
    if (!legalEntity) throw new BadRequestException(`Legal entity '${dto.legalEntityCode}' introuvable`);

    const now = new Date();
    const unit = this.businessUnits.create({
      code: dto.code,
      name: dto.name,
      legalEntityId: legalEntity.id,
      tagline: dto.tagline ?? null,
      footerLine: dto.footerLine ?? null,
      theme: dto.theme ?? null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    await this.businessUnits.save(unit);
    this.businessUnitResolver.invalidateCache();
    return this.findBusinessUnit(dto.code);
  }

  async updateBusinessUnit(code: string, dto: UpdateBusinessUnitDto): Promise<BusinessUnitDetail> {
    const unit = await this.businessUnits.findOne({ where: { code } });
    if (!unit) throw new NotFoundException(`Business unit '${code}' introuvable`);

    if (dto.legalEntityCode !== undefined) {
      const legalEntity = await this.legalEntities.findOne({ where: { code: dto.legalEntityCode } });
      if (!legalEntity) throw new BadRequestException(`Legal entity '${dto.legalEntityCode}' introuvable`);
      unit.legalEntityId = legalEntity.id;
    }
    if (dto.name !== undefined) unit.name = dto.name;
    if (dto.tagline !== undefined) unit.tagline = dto.tagline;
    if (dto.footerLine !== undefined) unit.footerLine = dto.footerLine;
    if (dto.theme !== undefined) unit.theme = dto.theme;
    if (dto.isActive !== undefined) unit.isActive = dto.isActive;
    unit.updatedAt = new Date();

    await this.businessUnits.save(unit);
    // Only `code` feeds the resolver's cache key; nothing edited here can
    // change it, but invalidating unconditionally is cheap and keeps this
    // safe against a future field ever becoming part of that cache.
    this.businessUnitResolver.invalidateCache();
    return this.findBusinessUnit(code);
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

  async listProducts(filter?: { isInternal?: boolean; archived?: boolean }): Promise<ProductSummary[]> {
    const where: FindOptionsWhere<Product> = {};
    if (filter?.isInternal !== undefined) {
      where.isInternal = filter.isInternal;
    }
    if (filter?.archived !== undefined) {
      where.archived = filter.archived;
    }
    const rows = await this.products.find({
      where,
      relations: ['businessUnit'],
      order: { code: 'ASC' },
    });
    return rows.map((p) => this.toProductSummary(p));
  }

  async createProduct(dto: CreateProductDto): Promise<ProductSummary> {
    const existing = await this.products.findOne({ where: { code: dto.code } });
    if (existing) throw new ConflictException(`Product '${dto.code}' existe déjà`);
    const businessUnitId = await this.businessUnitResolver.resolve(dto.businessUnitCode);

    const now = new Date();
    const product = this.products.create({
      code: dto.code,
      name: dto.name,
      businessUnitId,
      isInternal: dto.isInternal ?? false,
      sourceAliases: dto.sourceAliases ?? [],
      archived: false,
      createdAt: now,
      updatedAt: now,
    });
    const saved = await this.products.save(product);
    saved.businessUnit = await this.businessUnits.findOne({ where: { id: businessUnitId } }) ?? undefined;
    return this.toProductSummary(saved);
  }

  async updateProduct(code: string, dto: UpdateProductDto): Promise<ProductSummary> {
    const product = await this.products.findOne({ where: { code }, relations: ['businessUnit'] });
    if (!product) throw new NotFoundException(`Product '${code}' introuvable`);

    if (dto.name !== undefined) product.name = dto.name;
    if (dto.isInternal !== undefined) product.isInternal = dto.isInternal;
    if (dto.sourceAliases !== undefined) product.sourceAliases = dto.sourceAliases;
    if (dto.archived !== undefined) product.archived = dto.archived;
    product.updatedAt = new Date();

    const saved = await this.products.save(product);
    return this.toProductSummary(saved);
  }

  /**
   * Unconditional hard delete: unlike `BusinessUnit`/`RoadmapInitiative`,
   * nothing in the schema holds a FK onto `products` — no dependent-row
   * check is needed because there is nothing that could be orphaned.
   */
  async removeProduct(code: string): Promise<void> {
    const product = await this.products.findOne({ where: { code } });
    if (!product) throw new NotFoundException(`Product '${code}' introuvable`);
    await this.products.remove(product);
  }

  private toProductSummary(p: Product): ProductSummary {
    return {
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
      archived: p.archived,
      provisionable: PROVISIONABLE_PRODUCT_CODES.has(p.code),
    };
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
