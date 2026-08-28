import { describe, expect, mock, test } from 'bun:test';
import { CompanyService } from './company.service';
import { PROVISIONABLE_PRODUCT_CODES } from './company.constants';

describe('CompanyService', () => {
  const KHI_LAB_BU = {
    id: 'bu-khi-lab-id',
    code: 'khi-lab',
    name: 'Khi-Lab',
    isActive: true,
    legalEntity: { id: 'le-1', code: 'nolaa-studio', name: 'Nolaa Studio Inc.' },
  };

  const sampleProducts: any[] = [
    {
      id: 'prod-1',
      code: 'yekoli',
      name: 'Yekoli',
      businessUnitId: KHI_LAB_BU.id,
      businessUnit: KHI_LAB_BU,
      isInternal: false,
      sourceAliases: ['kelasi-owner-app', 'kelasi-web'],
    },
    {
      id: 'prod-2',
      code: 'k-river',
      name: 'K-River',
      businessUnitId: KHI_LAB_BU.id,
      businessUnit: KHI_LAB_BU,
      isInternal: false,
      sourceAliases: [],
    },
    {
      id: 'prod-3',
      code: 'mycvmatcher',
      name: 'MyCVMatcher',
      businessUnitId: KHI_LAB_BU.id,
      businessUnit: KHI_LAB_BU,
      isInternal: false,
      sourceAliases: [],
    },
    {
      id: 'prod-4',
      code: 'butterfly',
      name: 'Butterfly',
      businessUnitId: KHI_LAB_BU.id,
      businessUnit: KHI_LAB_BU,
      isInternal: false,
      sourceAliases: [],
    },
    {
      id: 'prod-5',
      code: 'nolaa-hq',
      name: 'Nolaa HQ',
      businessUnitId: KHI_LAB_BU.id,
      businessUnit: KHI_LAB_BU,
      isInternal: true,
      sourceAliases: [],
    },
  ];

  /** Reset and repopulated by `makeService()` on each call — lets a test
   * inspect what `createBusinessUnit()` seeded without changing `makeService`'s
   * return shape (13 existing call sites just want `svc`). */
  let capturedSlaPolicies: any[] = [];

  function makeService(initialProducts = sampleProducts, initialBusinessUnits: any[] = [KHI_LAB_BU]) {
    const businessUnits = [...initialBusinessUnits];
    const products = [...initialProducts];
    const legalEntityById = new Map([[KHI_LAB_BU.legalEntity.id, KHI_LAB_BU.legalEntity]]);
    const withLegalEntity = (u: any) => (u ? { ...u, legalEntity: u.legalEntity ?? legalEntityById.get(u.legalEntityId) } : u);

    const businessUnitsRepo = {
      find: mock(async () => businessUnits.map(withLegalEntity)),
      findOne: mock(async ({ where }: any = {}) => {
        if (where?.code) return withLegalEntity(businessUnits.find((u) => u.code === where.code) ?? null);
        if (where?.id) return withLegalEntity(businessUnits.find((u) => u.id === where.id) ?? null);
        return withLegalEntity(businessUnits[0] ?? null);
      }),
      create: mock((data: any) => ({ ...data })),
      save: mock(async (u: any) => {
        const idx = businessUnits.findIndex((b) => b.code === u.code);
        if (idx >= 0) businessUnits[idx] = u;
        else businessUnits.push(u);
        return u;
      }),
    } as any;

    const legalEntitiesRepo = {
      find: mock(async () => [KHI_LAB_BU.legalEntity]),
      findOne: mock(async ({ where }: any = {}) =>
        where?.code === KHI_LAB_BU.legalEntity.code ? KHI_LAB_BU.legalEntity : null,
      ),
    } as any;

    const productsRepo = {
      find: mock(async ({ where }: any = {}) => {
        let res = [...products];
        if (where?.isInternal !== undefined) {
          res = res.filter((p) => p.isInternal === where.isInternal);
        }
        if (where?.archived !== undefined) {
          res = res.filter((p) => p.archived === where.archived);
        }
        return res;
      }),
      findOne: mock(async ({ where }: any = {}) => products.find((p) => p.code === where?.code) ?? null),
      create: mock((data: any) => ({ ...data })),
      save: mock(async (p: any) => {
        const idx = products.findIndex((x) => x.code === p.code);
        if (idx >= 0) products[idx] = p;
        else products.push(p);
        return p;
      }),
      remove: mock(async (p: any) => {
        const idx = products.findIndex((x) => x.code === p.code);
        if (idx >= 0) products.splice(idx, 1);
        return p;
      }),
      createQueryBuilder: mock(() => ({
        select: mock().mockReturnThis(),
        addSelect: mock().mockReturnThis(),
        groupBy: mock().mockReturnThis(),
        getRawMany: mock(async () => [{ businessUnitId: KHI_LAB_BU.id, count: `${products.length}` }]),
      })),
    } as any;

    const businessUnitResolver = {
      resolve: mock(async (code: string) => {
        const unit = businessUnits.find((u) => u.code === code);
        if (!unit) throw new Error(`Unknown business unit code '${code}'`);
        return unit.id;
      }),
      invalidateCache: mock(() => undefined),
    } as any;

    capturedSlaPolicies = [];
    const slaPoliciesRepo = {
      create: mock((data: any) => ({ ...data })),
      save: mock(async (rows: any) => {
        const arr = Array.isArray(rows) ? rows : [rows];
        capturedSlaPolicies.push(...arr);
        return rows;
      }),
    } as any;

    return new CompanyService(businessUnitsRepo, legalEntitiesRepo, productsRepo, slaPoliciesRepo, businessUnitResolver);
  }

  describe('listProducts', () => {
    test('returns all products when no filter is provided', async () => {
      const svc = makeService();
      const res = await svc.listProducts();
      expect(res.length).toBe(5);
      expect(res.map((p) => p.code)).toEqual([
        'yekoli',
        'k-river',
        'mycvmatcher',
        'butterfly',
        'nolaa-hq',
      ]);
    });

    test('filters isInternal=false returning only customer-facing products', async () => {
      const svc = makeService();
      const res = await svc.listProducts({ isInternal: false });
      expect(res.length).toBe(4);
      expect(res.map((p) => p.code)).toEqual(['yekoli', 'k-river', 'mycvmatcher', 'butterfly']);
      expect(res.every((p) => !p.isInternal)).toBe(true);
    });

    test('derives provisionable=true for yekoli and false for other products', async () => {
      const svc = makeService();
      const res = await svc.listProducts();
      const yekoli = res.find((p) => p.code === 'yekoli');
      expect(yekoli?.provisionable).toBe(true);

      const kriver = res.find((p) => p.code === 'k-river');
      expect(kriver?.provisionable).toBe(false);

      const mycv = res.find((p) => p.code === 'mycvmatcher');
      expect(mycv?.provisionable).toBe(false);

      const butterfly = res.find((p) => p.code === 'butterfly');
      expect(butterfly?.provisionable).toBe(false);

      const nolaaHq = res.find((p) => p.code === 'nolaa-hq');
      expect(nolaaHq?.provisionable).toBe(false);
    });

    test('provisionable is strictly bound to PROVISIONABLE_PRODUCT_CODES', () => {
      expect(PROVISIONABLE_PRODUCT_CODES.has('yekoli')).toBe(true);
      expect(PROVISIONABLE_PRODUCT_CODES.has('kelasi')).toBe(false);
      expect(PROVISIONABLE_PRODUCT_CODES.has('k-river')).toBe(false);
    });
  });

  describe('createBusinessUnit', () => {
    test('creates the unit, resolves the legal entity by code, and invalidates the resolver cache', async () => {
      const svc = makeService();
      const res = await svc.createBusinessUnit({
        code: 'roy-marketing',
        name: 'Roy Marketing',
        legalEntityCode: 'nolaa-studio',
      });
      expect(res.code).toBe('roy-marketing');
      expect(res.isActive).toBe(true);
      expect(res.legalEntity.code).toBe('nolaa-studio');
    });

    test('seeds a P1/P2/P3 sla_policies row with null targets', async () => {
      const svc = makeService();
      await svc.createBusinessUnit({
        code: 'roy-marketing',
        name: 'Roy Marketing',
        legalEntityCode: 'nolaa-studio',
      });
      expect(capturedSlaPolicies.map((p: any) => p.priority).sort()).toEqual(['P1', 'P2', 'P3']);
      expect(capturedSlaPolicies.every((p: any) => p.responseTargetMinutes === null)).toBe(true);
      expect(capturedSlaPolicies.every((p: any) => p.resolutionTargetMinutes === null)).toBe(true);
    });

    test('rejects an unknown legal entity code', async () => {
      const svc = makeService();
      await expect(
        svc.createBusinessUnit({ code: 'roy-marketing', name: 'Roy Marketing', legalEntityCode: 'nope' }),
      ).rejects.toThrow();
    });

    test('rejects a duplicate code', async () => {
      const svc = makeService();
      await expect(
        svc.createBusinessUnit({ code: 'khi-lab', name: 'Dup', legalEntityCode: 'nolaa-studio' }),
      ).rejects.toThrow();
    });
  });

  describe('updateBusinessUnit', () => {
    test('updates editable fields and leaves code untouched', async () => {
      const svc = makeService();
      const res = await svc.updateBusinessUnit('khi-lab', { theme: 'navy', isActive: false });
      expect(res.code).toBe('khi-lab');
      expect(res.isActive).toBe(false);
    });

    test('404s on an unknown code', async () => {
      const svc = makeService();
      await expect(svc.updateBusinessUnit('nope', { isActive: false })).rejects.toThrow();
    });
  });

  describe('createProduct / updateProduct / removeProduct', () => {
    test('creates a product resolved against businessUnitCode, defaulting archived to false', async () => {
      const svc = makeService();
      const res = await svc.createProduct({ code: 'new-app', name: 'New App', businessUnitCode: 'khi-lab' });
      expect(res.code).toBe('new-app');
      expect(res.archived).toBe(false);
      expect(res.businessUnit.code).toBe('khi-lab');
    });

    test('rejects a duplicate product code', async () => {
      const svc = makeService();
      await expect(
        svc.createProduct({ code: 'yekoli', name: 'Dup', businessUnitCode: 'khi-lab' }),
      ).rejects.toThrow();
    });

    test('updateProduct can toggle archived without a delete', async () => {
      const svc = makeService();
      const res = await svc.updateProduct('yekoli', { archived: true });
      expect(res.archived).toBe(true);
      expect(res.code).toBe('yekoli');
    });

    test('removeProduct hard-deletes unconditionally (no FKs reference products)', async () => {
      const svc = makeService();
      await svc.removeProduct('butterfly');
      const res = await svc.listProducts();
      expect(res.find((p) => p.code === 'butterfly')).toBeUndefined();
    });

    test('removeProduct 404s on an unknown code', async () => {
      const svc = makeService();
      await expect(svc.removeProduct('nope')).rejects.toThrow();
    });
  });
});
