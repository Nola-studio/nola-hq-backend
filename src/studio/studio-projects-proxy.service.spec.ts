import { describe, expect, test, mock } from 'bun:test';
import { NotFoundException } from '@nestjs/common';
import { StudioProjectsProxyService } from './studio-projects-proxy.service';
import type { RoadmapInitiative } from '../roadmap/roadmap-initiative.entity';

describe('StudioProjectsProxyService (Brand Scope Filtering)', () => {
  const KHI_LAB_ID = 'bu-khi-lab-uuid-1111';
  const VANTELIS_ID = 'bu-vantelis-uuid-2222';

  const sampleProjects: Partial<RoadmapInitiative>[] = [
    {
      id: 'proj-1',
      title: 'Yekoli App',
      keyPrefix: 'YEK',
      scope: 'project',
      businessUnitId: KHI_LAB_ID,
      businessUnit: { id: KHI_LAB_ID, code: 'khi-lab', name: 'Khi-Lab' } as any,
      archived: false,
    },
    {
      id: 'proj-2',
      title: 'Vantelis Helpdesk',
      keyPrefix: 'VHD',
      scope: 'project',
      businessUnitId: VANTELIS_ID,
      businessUnit: { id: VANTELIS_ID, code: 'vantelis-it', name: 'Vantelis IT' } as any,
      archived: false,
    },
  ];

  const businessUnitsMock = {
    resolveAllowedUnits: mock(async (roles: string[] = []) => {
      if (roles.includes('hq:owner')) return [KHI_LAB_ID, VANTELIS_ID];
      if (roles.includes('hq:bu:khi-lab')) return [KHI_LAB_ID];
      if (roles.includes('hq:bu:vantelis-it')) return [VANTELIS_ID];
      return [];
    }),
  } as any;

  function makeService(rows: Partial<RoadmapInitiative>[]) {
    const projectsRepo = {
      find: mock(async ({ where }: any = {}) => {
        let res = [...rows];
        if (where?.scope) res = res.filter((r) => r.scope === where.scope);
        const buIn = where?.businessUnitId?._value ?? where?.businessUnitId;
        if (buIn) res = res.filter((r) => buIn.includes(r.businessUnitId));
        return res;
      }),
      findOne: mock(async ({ where }: any) => {
        let res = [...rows];
        if (where.id) res = res.filter((r) => r.id === where.id);
        if (where.scope) res = res.filter((r) => r.scope === where.scope);
        const buIn = where?.businessUnitId?._value ?? where?.businessUnitId;
        if (buIn) res = res.filter((r) => buIn.includes(r.businessUnitId));
        return res[0] ?? null;
      }),
      save: mock(async (p: any) => p),
    } as any;

    const tasksRepo = {
      count: mock(async () => 0),
    } as any;

    const teamRepo = {} as any;
    const roadmapMock = {
      createInitiative: mock(async () => ({})),
      updateInitiative: mock(async () => ({})),
    } as any;
    const workItemsMock = {} as any;
    const notifyMock = {} as any;

    return new StudioProjectsProxyService(
      projectsRepo,
      tasksRepo,
      teamRepo,
      roadmapMock,
      workItemsMock,
      notifyMock,
      businessUnitsMock,
    );
  }

  describe('listProjects', () => {
    test('hq:owner sees projects from all brands', async () => {
      const svc = makeService(sampleProjects);
      const res = await svc.listProjects({}, ['hq:owner']);
      expect(res.length).toBe(2);
      expect(res.map((p) => p.id)).toEqual(['proj-1', 'proj-2']);
    });

    test('khi-lab viewer sees only khi-lab projects', async () => {
      const svc = makeService(sampleProjects);
      const res = await svc.listProjects({}, ['hq:viewer', 'hq:bu:khi-lab']);
      expect(res.length).toBe(1);
      expect(res[0].id).toBe('proj-1');
      expect(res[0].businessUnit?.code).toBe('khi-lab');
    });

    test('unscoped non-owner sees zero projects (fail-closed)', async () => {
      const svc = makeService(sampleProjects);
      const res = await svc.listProjects({}, ['hq:viewer']);
      expect(res).toEqual([]);
    });
  });

  describe('findProject', () => {
    test('hq:owner can find any project', async () => {
      const svc = makeService(sampleProjects);
      const p1 = await svc.findProject('proj-1', ['hq:owner']);
      expect(p1.id).toBe('proj-1');
      const p2 = await svc.findProject('proj-2', ['hq:owner']);
      expect(p2.id).toBe('proj-2');
    });

    test('khi-lab viewer can find proj-1 but 404s on proj-2 (vantelis)', async () => {
      const svc = makeService(sampleProjects);
      const p1 = await svc.findProject('proj-1', ['hq:viewer', 'hq:bu:khi-lab']);
      expect(p1.id).toBe('proj-1');

      expect(svc.findProject('proj-2', ['hq:viewer', 'hq:bu:khi-lab'])).rejects.toThrow(
        NotFoundException,
      );
    });

    test('unscoped non-owner 404s on all projects', async () => {
      const svc = makeService(sampleProjects);
      expect(svc.findProject('proj-1', ['hq:viewer'])).rejects.toThrow(NotFoundException);
      expect(svc.findProject('proj-2', ['hq:viewer'])).rejects.toThrow(NotFoundException);
    });
  });

  describe('mutations (operator brand isolation)', () => {
    test('khi-lab operator can update proj-1 but 404s on proj-2 (vantelis)', async () => {
      const svc = makeService(sampleProjects);
      await svc.updateProject('proj-1', { name: 'Renamed' }, ['hq:operator', 'hq:bu:khi-lab']);

      expect(
        svc.updateProject('proj-2', { name: 'Renamed' }, ['hq:operator', 'hq:bu:khi-lab']),
      ).rejects.toThrow(NotFoundException);
    });

    test('khi-lab operator can archive proj-1 but 404s on proj-2 (vantelis)', async () => {
      const svc = makeService(sampleProjects);
      const res = await svc.archiveProject('proj-1', ['hq:operator', 'hq:bu:khi-lab']);
      expect(res.status).toBe('archived');

      expect(
        svc.archiveProject('proj-2', ['hq:operator', 'hq:bu:khi-lab']),
      ).rejects.toThrow(NotFoundException);
    });

    test('khi-lab operator can unarchive proj-1 but 404s on proj-2 (vantelis)', async () => {
      const svc = makeService(sampleProjects);
      const res = await svc.unarchiveProject('proj-1', ['hq:operator', 'hq:bu:khi-lab']);
      expect(res.status).toBe('active');

      expect(
        svc.unarchiveProject('proj-2', ['hq:operator', 'hq:bu:khi-lab']),
      ).rejects.toThrow(NotFoundException);
    });

    test('unscoped operator 404s on all mutations', async () => {
      const svc = makeService(sampleProjects);
      expect(
        svc.updateProject('proj-1', { name: 'Renamed' }, ['hq:operator']),
      ).rejects.toThrow(NotFoundException);
      expect(
        svc.archiveProject('proj-1', ['hq:operator']),
      ).rejects.toThrow(NotFoundException);
      expect(
        svc.unarchiveProject('proj-1', ['hq:operator']),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
