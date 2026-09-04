import { describe, expect, mock, test } from 'bun:test';
import { ExecutionReferencesService } from './execution-references.service';
import type { ExecutionReference } from './execution-reference.entity';

/**
 * Dire « ce référentiel concerne le projet Nolaa HQ » doit le dire aussi aux
 * tickets qui en découlent. Sans cela ils restent sans projet, donc sans dépôt
 * autorisé, donc sans « Start Work » — et l'affirmation est une demi-vérité.
 */

function makeService(reference: Partial<ExecutionReference> = {}, versionIds = ['v1', 'v2']) {
  const row = {
    id: 'ref-1',
    key: 'REF-NOLAAHQ',
    title: 'Référentiel',
    domainId: null,
    productId: null,
    projectId: null,
    owner: 'moi@nolaa.dev',
    ...reference,
  } as ExecutionReference;

  const references = {
    findOne: mock(async () => row),
    save: mock(async (r: ExecutionReference) => r),
  } as never;

  const versions = {
    find: mock(async () => versionIds.map((id) => ({ id }))),
  } as never;

  const updates: { where: Record<string, unknown>; patch: Record<string, unknown> }[] = [];
  const workItems = {
    update: mock(async (where: Record<string, unknown>, patch: Record<string, unknown>) => {
      updates.push({ where, patch });
      return { affected: 106 };
    }),
  } as never;

  return { svc: new ExecutionReferencesService(references, versions, workItems), row, updates };
}

describe('rattacher un référentiel à un projet', () => {
  test('rattache aussi les tickets qu’il a déjà produits', async () => {
    const { svc, updates } = makeService();
    await svc.update('REF-NOLAAHQ', { projectId: 'proj-nolaa-hq' });

    expect(updates).toHaveLength(1);
    expect(updates[0].patch).toMatchObject({ projectId: 'proj-nolaa-hq' });
  });

  /**
   * Le rattachement porte sur ce que *ce* référentiel a produit — pas sur le
   * backlog entier, et pas sur les tickets saisis à la main.
   */
  test('la portée est limitée aux items de ce référentiel', async () => {
    const { svc, updates } = makeService();
    await svc.update('REF-NOLAAHQ', { projectId: 'proj-1' });

    expect(updates[0].where).toMatchObject({ sourceKind: 'manifest' });
    expect(updates[0].where).toHaveProperty('sourceRefId');
  });

  /** Un projet posé à la main est une décision ; la propagation ne la défait pas. */
  test('les tickets qui ont déjà un projet ne sont pas touchés', async () => {
    const { svc, updates } = makeService();
    await svc.update('REF-NOLAAHQ', { projectId: 'proj-1' });

    expect(updates[0].where).toHaveProperty('projectId');
  });

  test('ne rien changer au projet ne déclenche aucun rattachement', async () => {
    const { svc, updates } = makeService({ projectId: 'proj-1' });
    await svc.update('REF-NOLAAHQ', { projectId: 'proj-1' });
    expect(updates).toHaveLength(0);
  });

  test('modifier autre chose ne déclenche rien non plus', async () => {
    const { svc, updates } = makeService();
    await svc.update('REF-NOLAAHQ', { owner: 'greg@nolaa.dev' });
    expect(updates).toHaveLength(0);
  });

  /** Détacher est légitime, mais ne débranche pas les tickets déjà rattachés. */
  test('retirer le projet du référentiel ne détache pas les tickets', async () => {
    const { svc, updates } = makeService({ projectId: 'proj-1' });
    await svc.update('REF-NOLAAHQ', { projectId: null });

    expect(updates).toHaveLength(0);
  });

  test('un référentiel sans version n’a rien à rattacher', async () => {
    const { svc, updates } = makeService({}, []);
    await svc.update('REF-NOLAAHQ', { projectId: 'proj-1' });
    expect(updates).toHaveLength(0);
  });
});
