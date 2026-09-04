import { describe, expect, mock, test } from 'bun:test';
import { NotFoundException } from '@nestjs/common';
import { DomainsService } from './domains.service';

describe('DomainsService', () => {
  function makeService() {
    const domainRows: any[] = [
      { id: 'u6', code: 'D06', name: 'Projets, ingénierie et qualité', owner: null, position: 60 },
      { id: 'u1', code: 'D01', name: 'Groupe et gouvernance', owner: null, position: 10 },
    ];
    const capabilityRows: any[] = [
      { id: 'c2', code: 'D06.C02', domainId: 'u6', name: 'Planification et exécution', owner: null, position: 20 },
      { id: 'c1', code: 'D06.C01', domainId: 'u6', name: 'Modèle de travail unifié', owner: null, position: 10 },
    ];

    const domains = {
      find: mock(async () => [...domainRows].sort((a, b) => a.position - b.position)),
      findOne: mock(async ({ where }: any) => domainRows.find((d) => d.code === where.code) ?? null),
      save: mock(async (d: any) => d),
    } as any;

    const capabilities = {
      find: mock(async ({ where }: any) =>
        capabilityRows.filter((c) => c.domainId === where.domainId).sort((a, b) => a.position - b.position),
      ),
      findOne: mock(async ({ where }: any) => capabilityRows.find((c) => c.code === where.code) ?? null),
      save: mock(async (c: any) => c),
    } as any;

    return new DomainsService(domains, capabilities);
  }

  test('lists domains in position order, not code order', async () => {
    const list = await makeService().list();
    expect(list.map((d) => d.code)).toEqual(['D01', 'D06']);
  });

  /** Codes appear in URLs, where nobody types them in caps reliably. */
  test('resolves a domain code case-insensitively', async () => {
    const svc = makeService();
    expect((await svc.findByCode('d06')).name).toBe('Projets, ingénierie et qualité');
  });

  test('an unknown code is a 404, never an empty result', async () => {
    await expect(makeService().findByCode('D99')).rejects.toThrow(NotFoundException);
  });

  test('lists a domain’s capabilities in position order', async () => {
    const caps = await makeService().listCapabilities('D06');
    expect(caps.map((c) => c.code)).toEqual(['D06.C01', 'D06.C02']);
  });

  test('capabilities of an unknown domain are a 404, not an empty list', async () => {
    await expect(makeService().listCapabilities('D99')).rejects.toThrow(NotFoundException);
  });

  test('patching sets owner and position, and nothing else', async () => {
    const svc = makeService();
    const before = await svc.findByCode('D06');
    const after = await svc.updateDomain('D06', { owner: 'greg@nola.cd', position: 5 });
    expect(after.owner).toBe('greg@nola.cd');
    expect(after.position).toBe(5);
    expect(after.code).toBe(before.code);
    expect(after.name).toBe(before.name);
  });

  /** `null` clears an owner; `undefined` (absent field) must leave it alone. */
  test('an absent field is left untouched, an explicit null clears it', async () => {
    const svc = makeService();
    await svc.updateDomain('D06', { owner: 'greg@nola.cd' });
    // Patching only `position` must not silently drop the owner.
    expect((await svc.updateDomain('D06', { position: 7 })).owner).toBe('greg@nola.cd');

    const svc2 = makeService();
    const cleared = await svc2.updateDomain('D06', { owner: null });
    expect(cleared.owner).toBe(null);
  });

  test('patching an unknown capability is a 404', async () => {
    await expect(makeService().updateCapability('D06.C99', { position: 1 })).rejects.toThrow(NotFoundException);
  });
});
