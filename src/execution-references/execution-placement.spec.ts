import { describe, expect, test } from 'bun:test';
import { resolvePlacement } from './execution-placement';
import type { ExecutionManifestItem } from './execution-manifest.entity';
import type { Capability, Domain } from '../domains/domain.entity';

/**
 * Le domaine n'est pas obligatoire.
 *
 * L'import écartait tout item qui n'atteignait pas un domaine en remontant ses
 * parents — un document qui ne déclare que des epics et leurs stories
 * s'importait donc en zéro ticket, sans que rien ne dise que le rédacteur
 * aurait dû écrire une hiérarchie qu'il n'avait pas. Ce qui manque au
 * classement se règle dans HQ, sur le ticket ; ce qui ment dans le document
 * reste une erreur.
 */

function item(over: Partial<ExecutionManifestItem> = {}): ExecutionManifestItem {
  return {
    sourceKey: 'BIL-01',
    kind: 'epic',
    parentKey: null,
    title: 'Générer les factures',
    ...over,
  } as ExecutionManifestItem;
}

const DOMAINS = new Map<string, Domain>([
  ['D08', { id: 'dom-8', code: 'D08', name: 'Finance' } as Domain],
]);
const CAPABILITIES = new Map<string, Capability>([
  ['D08.C02', { id: 'cap-2', code: 'D08.C02', domainId: 'dom-8' } as Capability],
]);

function place(subject: ExecutionManifestItem, all: ExecutionManifestItem[] = []) {
  const byKey = new Map([subject, ...all].map((i) => [i.sourceKey, i]));
  return resolvePlacement(subject, byKey, DOMAINS, CAPABILITIES);
}

describe('resolvePlacement', () => {
  test('sans parent, l’item entre non classé plutôt que d’être écarté', () => {
    expect(place(item())).toEqual({ ok: true, domainId: null, capabilityId: null });
  });

  test('une story hérite du domaine de son epic', () => {
    const epic = item({ sourceKey: 'BIL-01', parentKey: 'D08' });
    const story = item({ sourceKey: 'US-BIL-01-1', kind: 'story', parentKey: 'BIL-01' });

    expect(place(story, [epic])).toEqual({ ok: true, domainId: 'dom-8', capabilityId: null });
  });

  test('une story d’un epic non classé est non classée, pas rejetée', () => {
    const epic = item({ sourceKey: 'BIL-02' });
    const story = item({ sourceKey: 'US-BIL-02-1', kind: 'story', parentKey: 'BIL-02' });

    expect(place(story, [epic])).toEqual({ ok: true, domainId: null, capabilityId: null });
  });

  test('une capacité donne le domaine et la capacité', () => {
    expect(place(item({ parentKey: 'D08.C02' }))).toEqual({
      ok: true,
      domainId: 'dom-8',
      capabilityId: 'cap-2',
    });
  });

  /**
   * Ce qui reste une erreur : le document affirme un rattachement qui n'existe
   * nulle part. L'inventer pour faire réussir l'import déplacerait le problème
   * dans le backlog.
   */
  test('un domaine inconnu est refusé, et le motif nomme la clé', () => {
    const result = place(item({ parentKey: 'D99' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('D99');
  });

  test('un cycle est refusé plutôt que parcouru sans fin', () => {
    const a = item({ sourceKey: 'A', parentKey: 'B' });
    const b = item({ sourceKey: 'B', parentKey: 'A' });
    const result = place(a, [b]);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('Cycle');
  });
});
