import { test, expect, describe, mock } from 'bun:test';

/**
 * Phase 6a du rename Kelasi → Yekoli : le listener doit couvrir les DEUX
 * variantes de sujet pendant la transition, chacune via son propre consumer
 * durable (EventBus.consume binde un durable existant tel quel — le durable
 * historique doit donc rester sur le sujet kelasi, et la variante yekoli
 * doit avoir un nom de durable distinct).
 *
 * Le handler lui-même est testé sans Nest ni NATS (même pattern que
 * roadmap.service.spec.ts : dépendances mockées à la main).
 *
 * `@nola-hq/nola-sdk` est stubbé : sous bun, `emitDecoratorMetadata` fait
 * référencer l'interface `NolaConfig` à l'exécution dans la lib locale —
 * on n'a besoin que du symbole `NolaClientService` pour instancier.
 */
mock.module('@nola-hq/nola-sdk', () => ({ NolaClientService: class {} }));
mock.module('jose', () => ({
  createRemoteJWKSet: () => () => {},
  jwtVerify: async () => ({ payload: {} }),
}));
const { SupportIngestListener } = await import('./support-ingest.listener');

describe('SupportIngestListener.SOURCES (écoute kelasi/yekoli/vantelisit)', () => {
  test('écoute les variantes de sujet kelasi, yekoli et vantelisit', () => {
    const filters = SupportIngestListener.SOURCES.map((s) => s.filter);
    expect(filters).toContain('nola.events.kelasi.support.requested');
    expect(filters).toContain('nola.events.yekoli.support.requested');
    expect(filters).toContain('nola.events.vantelisit.support.requested');
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

  test('chaque source déclare obligatoirement un businessUnitCode', () => {
    for (const source of SupportIngestListener.SOURCES) {
      expect(typeof source.businessUnitCode).toBe('string');
      expect(source.businessUnitCode.length).toBeGreaterThan(0);
    }
  });

  test('les sujets kelasi/yekoli vont sur khi-lab, vantelisit sur vantelis-it', () => {
    const byFilter = new Map(
      SupportIngestListener.SOURCES.map((s) => [s.filter, s.businessUnitCode]),
    );
    expect(byFilter.get('nola.events.kelasi.support.requested')).toBe('khi-lab');
    expect(byFilter.get('nola.events.yekoli.support.requested')).toBe('khi-lab');
    expect(byFilter.get('nola.events.vantelisit.support.requested')).toBe(
      'vantelis-it',
    );
  });
});

describe('SupportIngestListener.handle (même handler pour tous les sujets)', () => {
  function makeListener() {
    const create = mock(() => Promise.resolve({}));
    const listener = new SupportIngestListener(
      { isReady: () => true, getClient: () => ({}) } as never,
      { create } as never,
      { get: () => 'true' } as never,
    );
    // `handle` est privé : on l'exerce via un cast, comme un délivré NATS.
    const handle = (env: unknown, businessUnitCode: string) =>
      (
        listener as unknown as {
          handle: (e: unknown, bu: string) => Promise<void>;
        }
      ).handle(env, businessUnitCode);
    return { handle, create };
  }

  const payload = {
    tenant: 'tenant-1',
    contact: 'owner@example.com',
    subject: 'Aide',
    message: 'Bonjour',
    category: 'technical',
    priority: 'P2',
  };

  test('crée un ticket, que l’évènement vienne du sujet kelasi…', async () => {
    const { handle, create } = makeListener();
    await handle(
      {
        event: 'nola.events.kelasi.support.requested',
        payload,
        metadata: { correlationId: '', source: '', emittedAt: '' },
      },
      'khi-lab',
    );
    expect(create).toHaveBeenCalledTimes(1);
    const arg = create.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.tenant).toBe('tenant-1');
    expect(arg.priority).toBe('P2');
    expect(arg.businessUnitCode).toBe('khi-lab');
  });

  test('…ou du sujet yekoli (comportement identique)', async () => {
    const { handle, create } = makeListener();
    await handle(
      {
        event: 'nola.events.yekoli.support.requested',
        payload,
        metadata: { correlationId: '', source: '', emittedAt: '' },
      },
      'khi-lab',
    );
    expect(create).toHaveBeenCalledTimes(1);
    const arg = create.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.tenant).toBe('tenant-1');
    expect(arg.subject).toBe('Aide');
    expect(arg.businessUnitCode).toBe('khi-lab');
  });

  test('…ou du sujet vantelisit (source vantelisit, marque vantelis-it)', async () => {
    const { handle, create } = makeListener();
    await handle(
      {
        event: 'nola.events.vantelisit.support.requested',
        payload: {
          tenant: 'org-lemieux',
          contact: 'directeur@lemieux.cd',
          subject: 'Erreur clôture paie',
          message: 'Blocage sur le calcul des cotisations.',
          category: 'technical',
          priority: 'P2',
          source: 'vantelisit',
          meta: {
            orgName: 'Lemieux & Associés',
            orgNumber: '0147',
            slaTarget: '15 min',
            dueAt: '2026-08-28T15:15:00.000Z',
          },
        },
        metadata: { correlationId: '', source: '', emittedAt: '' },
      },
      'vantelis-it',
    );
    expect(create).toHaveBeenCalledTimes(1);
    const arg = create.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.tenant).toBe('org-lemieux');
    expect(arg.subject).toBe('Erreur clôture paie');
    expect(arg.priority).toBe('P2');
    expect(arg.category).toBe('technical');
    expect(arg.source).toBe('vantelisit');
    // Le point du changement : la marque est vantelis-it, jamais le défaut
    // khi-lab ni une normalisation du segment de sujet 'vantelisit'.
    expect(arg.businessUnitCode).toBe('vantelis-it');
    // Le pied de contexte de HQ vient s'ajouter à celui du producteur.
    expect(String(arg.body)).toContain('Organisation : Lemieux & Associés');
    // L'engagement amont de Vantelis atterrit dans le corps — contexte
    // seulement, jamais la source de vérité SLA de HQ (sla_policies).
    expect(String(arg.body)).toContain('Engagement fournisseur : 15 min');
    expect(String(arg.body)).toContain('Échéance fournisseur : 2026-08-28T15:15:00.000Z');
    // ... et dueAt atterrit aussi comme colonne réelle, pour un futur usage
    // sans reparser le corps du ticket.
    expect(arg.dueAt).toBe('2026-08-28T15:15:00.000Z');
  });

  test('kelasi/yekoli sans slaTarget/dueAt : pas de ligne fournisseur, dueAt absent', async () => {
    const { handle, create } = makeListener();
    await handle(
      {
        event: 'nola.events.kelasi.support.requested',
        payload,
        metadata: { correlationId: '', source: '', emittedAt: '' },
      },
      'khi-lab',
    );
    const arg = create.mock.calls[0][0] as Record<string, unknown>;
    expect(String(arg.body)).not.toContain('Engagement fournisseur');
    expect(String(arg.body)).not.toContain('Échéance fournisseur');
    expect(arg.dueAt).toBeUndefined();
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
