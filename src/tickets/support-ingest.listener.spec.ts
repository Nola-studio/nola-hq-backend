import { test, expect, describe, mock } from 'bun:test';

/**
 * Le listener couvre un sujet par app productrice, chacun via son propre
 * consumer durable (EventBus.consume binde un durable existant tel quel — le
 * durable historique doit donc rester sur le sujet kelasi, et tout nouveau
 * sujet doit avoir un nom de durable distinct).
 *
 * Producteurs : kelasi (historique), yekoli (post-rename), vantelisit.
 *
 * Le handler lui-même est testé sans Nest ni NATS (même pattern que
 * roadmap.service.spec.ts : dépendances mockées à la main).
 *
 * `@nola-hq/nola-sdk` est stubbé : sous bun, `emitDecoratorMetadata` fait
 * référencer l'interface `NolaConfig` à l'exécution dans la lib locale —
 * on n'a besoin que du symbole `NolaClientService` pour instancier.
 */
mock.module('@nola-hq/nola-sdk', () => ({ NolaClientService: class {} }));
const { SupportIngestListener } = await import('./support-ingest.listener');

describe('SupportIngestListener.SOURCES (un sujet par app productrice)', () => {
  test('écoute les deux variantes du rename kelasi/yekoli', () => {
    const filters = SupportIngestListener.SOURCES.map((s) => s.filter);
    expect(filters).toContain('nola.events.kelasi.support.requested');
    expect(filters).toContain('nola.events.yekoli.support.requested');
  });

  test('écoute le portail Vantelis IT', () => {
    const source = SupportIngestListener.SOURCES.find(
      (s) => s.filter === 'nola.events.vantelisit.support.requested',
    );
    expect(source).toBeDefined();
    expect(source?.consumer).toBe('nola-hq-support-ingest-vantelisit');
  });

  test('businessUnitCode est déclaré par source, jamais dérivé du sujet', () => {
    const byFilter = new Map(SupportIngestListener.SOURCES.map((s) => [s.filter, s.businessUnitCode]));
    expect(byFilter.get('nola.events.kelasi.support.requested')).toBe('khi-lab');
    expect(byFilter.get('nola.events.yekoli.support.requested')).toBe('khi-lab');
    // 'vantelis-it', pas 'vantelisit' : le code business_units réel, pas le
    // segment d'app du sujet NATS ni le nom du realm Keycloak.
    expect(byFilter.get('nola.events.vantelisit.support.requested')).toBe('vantelis-it');
  });

  test('le durable historique reste lié au sujet kelasi (état préservé)', () => {
    const legacy = SupportIngestListener.SOURCES.find(
      (s) => s.consumer === 'nola-hq-support-ingest',
    );
    expect(legacy?.filter).toBe('nola.events.kelasi.support.requested');
  });

  test('un consumer durable distinct par sujet (pas de rebind silencieux)', () => {
    const consumers = SupportIngestListener.SOURCES.map((s) => s.consumer);
    expect(new Set(consumers).size).toBe(consumers.length);
    const filters = SupportIngestListener.SOURCES.map((s) => s.filter);
    expect(new Set(filters).size).toBe(filters.length);
  });
});

describe('SupportIngestListener.handle (même handler pour les deux sujets)', () => {
  function makeListener() {
    const create = mock(() => Promise.resolve({}));
    const listener = new SupportIngestListener(
      { isReady: () => true, getClient: () => ({}) } as never,
      { create } as never,
      { get: () => 'true' } as never,
    );
    // `handle` est privé : on l'exerce via un cast, comme un délivré NATS.
    // `businessUnitCode` est le deuxième argument que le boucle de
    // `bootstrap()` fournit depuis l'entrée SOURCES correspondante — jamais
    // dérivé ici, exactement comme en production.
    const handle = (env: unknown, businessUnitCode: string) =>
      (
        listener as unknown as {
          handle: (e: unknown, businessUnitCode: string) => Promise<void>;
        }
      ).handle(env, businessUnitCode);
    return { handle, create };
  }

  /** Le businessUnitCode réellement déclaré pour ce sujet dans SOURCES — pas un littéral dupliqué. */
  function businessUnitCodeFor(filter: string): string {
    const source = SupportIngestListener.SOURCES.find((s) => s.filter === filter);
    if (!source) throw new Error(`No SOURCES entry for ${filter}`);
    return source.businessUnitCode;
  }

  const payload = {
    tenant: 'tenant-1',
    contact: 'owner@example.com',
    subject: 'Aide',
    message: 'Bonjour',
    category: 'technical',
    priority: 'P2',
  };

  test('crée un ticket sur khi-lab, que l’évènement vienne du sujet kelasi…', async () => {
    const { handle, create } = makeListener();
    const filter = 'nola.events.kelasi.support.requested';
    await handle(
      { event: filter, payload, metadata: { correlationId: '', source: '', emittedAt: '' } },
      businessUnitCodeFor(filter),
    );
    expect(create).toHaveBeenCalledTimes(1);
    const arg = create.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.tenant).toBe('tenant-1');
    expect(arg.priority).toBe('P2');
    expect(arg.businessUnitCode).toBe('khi-lab');
  });

  test('…ou du sujet yekoli, aussi sur khi-lab (comportement identique)', async () => {
    const { handle, create } = makeListener();
    const filter = 'nola.events.yekoli.support.requested';
    await handle(
      { event: filter, payload, metadata: { correlationId: '', source: '', emittedAt: '' } },
      businessUnitCodeFor(filter),
    );
    expect(create).toHaveBeenCalledTimes(1);
    const arg = create.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.tenant).toBe('tenant-1');
    expect(arg.subject).toBe('Aide');
    expect(arg.businessUnitCode).toBe('khi-lab');
  });

  test('…ou du portail Vantelis IT, sur vantelis-it — pas khi-lab, pas vantelisit', async () => {
    const { handle, create } = makeListener();
    const filter = 'nola.events.vantelisit.support.requested';
    await handle(
      {
        event: filter,
        payload: {
          tenant: 'org_01H8ZQ',
          contact: 'marie@lemieux-associes.ca',
          subject: "Le partage de fichiers ne s'ouvre plus",
          message: 'Depuis ce matin.\n\n— Billet Vantelis IT —\nNuméro : 0147',
          category: 'technical',
          // Vantelis descend son P4 en P3 avant de publier : nous ne voyons
          // jamais qu'une priorité connue d'ici.
          priority: 'P3',
          source: 'vantelisit',
          meta: { orgName: 'Lemieux & Associés', role: 'client', personId: 'per_1' },
        },
        metadata: { correlationId: '', source: 'vantelisit', emittedAt: '' },
      },
      businessUnitCodeFor(filter),
    );
    expect(create).toHaveBeenCalledTimes(1);
    const arg = create.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.tenant).toBe('org_01H8ZQ');
    expect(arg.priority).toBe('P3');
    expect(arg.category).toBe('technical');
    expect(arg.source).toBe('vantelisit');
    // Le point du changement : la marque est vantelis-it, jamais le défaut
    // khi-lab ni une normalisation du segment de sujet 'vantelisit'.
    expect(arg.businessUnitCode).toBe('vantelis-it');
    // Le pied de contexte de HQ vient s'ajouter à celui du producteur.
    expect(String(arg.body)).toContain('Organisation : Lemieux & Associés');
    expect(String(arg.body)).toContain('Numéro : 0147');
  });

  test('droppe (ack) un payload malformé sans créer de ticket', async () => {
    const { handle, create } = makeListener();
    await handle(
      {
        event: 'nola.events.yekoli.support.requested',
        payload: { subject: '', message: '', tenant: '' },
        metadata: { correlationId: '', source: '', emittedAt: '' },
      },
      'khi-lab',
    );
    expect(create).not.toHaveBeenCalled();
  });
});
