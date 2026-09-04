import { describe, expect, mock, test } from 'bun:test';
import { SlaPolicyService } from './sla-policy.service';

describe('SlaPolicyService', () => {
  const KHI_LAB = { id: 'bu-khi-lab-id', code: 'khi-lab', name: 'Khi-Lab' };
  const VANTELIS = { id: 'bu-vantelis-id', code: 'vantelis-it', name: 'Vantelis IT' };

  function makeService(initialRows: any[] = []) {
    const rows = [...initialRows];
    const byUnit = new Map([[KHI_LAB.id, KHI_LAB], [VANTELIS.id, VANTELIS]]);
    const withBu = (r: any) => (r ? { ...r, businessUnit: byUnit.get(r.businessUnitId) } : r);

    const repo = {
      find: mock(async ({ where }: any = {}) => {
        let res = [...rows];
        if (where?.businessUnitId) res = res.filter((r) => r.businessUnitId === where.businessUnitId);
        return res.map(withBu);
      }),
      findOne: mock(async ({ where }: any) => {
        if (where?.id) return withBu(rows.find((r) => r.id === where.id) ?? null);
        if (where?.businessUnitId && where?.priority) {
          return withBu(
            rows.find((r) => r.businessUnitId === where.businessUnitId && r.priority === where.priority) ?? null,
          );
        }
        return null;
      }),
      create: mock((data: any) => ({ id: `sla-${rows.length + 1}`, ...data })),
      save: mock(async (r: any) => {
        const idx = rows.findIndex((x) => x.id === r.id);
        if (idx >= 0) rows[idx] = r;
        else rows.push(r);
        return r;
      }),
      remove: mock(async (r: any) => {
        const idx = rows.findIndex((x) => x.id === r.id);
        if (idx >= 0) rows.splice(idx, 1);
        return r;
      }),
    } as any;

    const businessUnitResolver = {
      resolve: mock(async (code: string) => {
        const unit = [KHI_LAB, VANTELIS].find((u) => u.code === code);
        if (!unit) throw new Error(`Unknown business unit code '${code}'`);
        return unit.id;
      }),
    } as any;

    return new SlaPolicyService(repo, businessUnitResolver);
  }

  test('creates a policy row resolved against businessUnitCode', async () => {
    const svc = makeService();
    const res = await svc.create({ businessUnitCode: 'vantelis-it', priority: 'P1', responseTargetMinutes: 15 });
    expect(res.businessUnit.code).toBe('vantelis-it');
    expect(res.priority).toBe('P1');
    expect(res.responseTargetMinutes).toBe(15);
    expect(res.resolutionTargetMinutes).toBeNull();
  });

  test('rejects a duplicate (businessUnit, priority) pair', async () => {
    const svc = makeService([
      { id: 'sla-1', businessUnitId: VANTELIS.id, priority: 'P1', responseTargetMinutes: 15, resolutionTargetMinutes: 240 },
    ]);
    await expect(
      svc.create({ businessUnitCode: 'vantelis-it', priority: 'P1' }),
    ).rejects.toThrow();
  });

  test('update changes only the targets', async () => {
    const svc = makeService([
      { id: 'sla-1', businessUnitId: VANTELIS.id, priority: 'P1', responseTargetMinutes: 15, resolutionTargetMinutes: 240 },
    ]);
    const res = await svc.update('sla-1', { resolutionTargetMinutes: 120 });
    expect(res.responseTargetMinutes).toBe(15);
    expect(res.resolutionTargetMinutes).toBe(120);
  });

  test('update can clear a target back to null (unconfigured)', async () => {
    const svc = makeService([
      { id: 'sla-1', businessUnitId: VANTELIS.id, priority: 'P1', responseTargetMinutes: 15, resolutionTargetMinutes: 240 },
    ]);
    const res = await svc.update('sla-1', { responseTargetMinutes: null });
    expect(res.responseTargetMinutes).toBeNull();
  });

  test('remove reverts the pair to "not tracked" (row gone, not just nulled)', async () => {
    const svc = makeService([
      { id: 'sla-1', businessUnitId: VANTELIS.id, priority: 'P1', responseTargetMinutes: 15, resolutionTargetMinutes: 240 },
    ]);
    await svc.remove('sla-1');
    const list = await svc.list('vantelis-it');
    expect(list).toEqual([]);
  });

  test('list filters by businessUnitCode', async () => {
    const svc = makeService([
      { id: 'sla-1', businessUnitId: VANTELIS.id, priority: 'P1', responseTargetMinutes: 15, resolutionTargetMinutes: 240 },
      { id: 'sla-2', businessUnitId: KHI_LAB.id, priority: 'P1', responseTargetMinutes: null, resolutionTargetMinutes: null },
    ]);
    const list = await svc.list('khi-lab');
    expect(list.length).toBe(1);
    expect(list[0].businessUnit.code).toBe('khi-lab');
  });

  test('findOne 404s on an unknown id', async () => {
    const svc = makeService();
    await expect(svc.findOne('nope')).rejects.toThrow();
  });
});
