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

  function makeService(products = sampleProducts) {
    const businessUnitsRepo = {
      find: mock(async () => [KHI_LAB_BU]),
      findOne: mock(async () => KHI_LAB_BU),
    } as any;

    const legalEntitiesRepo = {
      find: mock(async () => [KHI_LAB_BU.legalEntity]),
    } as any;

    const productsRepo = {
      find: mock(async ({ where }: any = {}) => {
        let res = [...products];
        if (where?.isInternal !== undefined) {
          res = res.filter((p) => p.isInternal === where.isInternal);
        }
        return res;
      }),
      createQueryBuilder: mock(() => ({
        select: mock().mockReturnThis(),
        addSelect: mock().mockReturnThis(),
        groupBy: mock().mockReturnThis(),
        getRawMany: mock(async () => [{ businessUnitId: KHI_LAB_BU.id, count: `${products.length}` }]),
      })),
    } as any;

    return new CompanyService(businessUnitsRepo, legalEntitiesRepo, productsRepo);
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
});
