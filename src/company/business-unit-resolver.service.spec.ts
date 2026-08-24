import { describe, expect, test } from 'bun:test';
import { BadRequestException } from '@nestjs/common';
import { BusinessUnitResolverService } from './business-unit-resolver.service';
import type { BusinessUnit } from './business-unit.entity';

describe('BusinessUnitResolverService', () => {
  const units: BusinessUnit[] = [
    {
      id: 'bu-khi-lab-uuid-1111',
      code: 'khi-lab',
      name: 'Khi-Lab',
      brandType: 'product',
      isActive: true,
      legalEntityId: 'le-uuid-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as BusinessUnit,
    {
      id: 'bu-vantelis-uuid-2222',
      code: 'vantelis-it',
      name: 'Vantelis IT',
      brandType: 'services',
      isActive: true,
      legalEntityId: 'le-uuid-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as BusinessUnit,
    {
      id: 'bu-nolaa-uuid-3333',
      code: 'nolaa-corp',
      name: 'Nolaa Corp',
      brandType: 'holding',
      isActive: false, // inactive/historical brand
      legalEntityId: 'le-uuid-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as BusinessUnit,
  ];

  const repo = {
    find: async () => units,
  } as any;

  function makeService() {
    return new BusinessUnitResolverService(repo);
  }

  describe('resolve', () => {
    test('resolves known code to its id', async () => {
      const svc = makeService();
      expect(await svc.resolve('khi-lab')).toBe('bu-khi-lab-uuid-1111');
      expect(await svc.resolve('vantelis-it')).toBe('bu-vantelis-uuid-2222');
    });

    test('throws BadRequestException listing valid codes on unknown code', async () => {
      const svc = makeService();
      expect(svc.resolve('unknown-code')).rejects.toThrow(BadRequestException);
    });
  });

  describe('resolveAllIds', () => {
    test('returns ALL business unit IDs including inactive ones', async () => {
      const svc = makeService();
      const allIds = await svc.resolveAllIds();
      expect(allIds).toEqual([
        'bu-khi-lab-uuid-1111',
        'bu-vantelis-uuid-2222',
        'bu-nolaa-uuid-3333',
      ]);
    });
  });

  describe('resolveAllowedUnits', () => {
    test('hq:owner resolves to ALL business unit IDs (including inactive)', async () => {
      const svc = makeService();
      const ids = await svc.resolveAllowedUnits(['hq:owner']);
      expect(ids).toEqual([
        'bu-khi-lab-uuid-1111',
        'bu-vantelis-uuid-2222',
        'bu-nolaa-uuid-3333',
      ]);
    });

    test('owner holding extra roles still resolves to ALL business units', async () => {
      const svc = makeService();
      const ids = await svc.resolveAllowedUnits(['hq:owner', 'hq:operator', 'hq:bu:khi-lab']);
      expect(ids).toEqual([
        'bu-khi-lab-uuid-1111',
        'bu-vantelis-uuid-2222',
        'bu-nolaa-uuid-3333',
      ]);
    });

    test('hq:viewer with single hq:bu:khi-lab role resolves to only khi-lab UUID', async () => {
      const svc = makeService();
      const ids = await svc.resolveAllowedUnits(['hq:viewer', 'hq:bu:khi-lab']);
      expect(ids).toEqual(['bu-khi-lab-uuid-1111']);
    });

    test('hq:operator with multiple hq:bu:* roles resolves to all matching UUIDs', async () => {
      const svc = makeService();
      const ids = await svc.resolveAllowedUnits([
        'hq:operator',
        'hq:bu:khi-lab',
        'hq:bu:vantelis-it',
      ]);
      expect(ids).toEqual(['bu-khi-lab-uuid-1111', 'bu-vantelis-uuid-2222']);
    });

    test('unscoped non-owner holding only hq:viewer resolves to EMPTY LIST (fail-closed)', async () => {
      const svc = makeService();
      const ids = await svc.resolveAllowedUnits(['hq:viewer']);
      expect(ids).toEqual([]);
    });

    test('unscoped non-owner holding only hq:operator resolves to EMPTY LIST (fail-closed)', async () => {
      const svc = makeService();
      const ids = await svc.resolveAllowedUnits(['hq:operator']);
      expect(ids).toEqual([]);
    });

    test('empty roles array resolves to EMPTY LIST (fail-closed)', async () => {
      const svc = makeService();
      const ids = await svc.resolveAllowedUnits([]);
      expect(ids).toEqual([]);
    });

    test('ignores foreign realm roles and unrecognised hq:bu:* codes', async () => {
      const svc = makeService();
      const ids = await svc.resolveAllowedUnits([
        'teacher',
        'school_admin',
        'hq:viewer',
        'hq:bu:nonexistent-brand',
      ]);
      expect(ids).toEqual([]);
    });
  });
});
