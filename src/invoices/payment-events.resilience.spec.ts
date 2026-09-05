import { test, expect, describe, mock } from 'bun:test';

/**
 * Le quatrième écouteur portait le même défaut que les trois autres.
 *
 * `ensureStream` est refusé en production — « subjects overlap with an
 * existing stream » : un flux de plateforme couvre déjà `nola.events.>`, et
 * HQ tentait d'en créer un second dessus. L'exception remontait d'un
 * `void this.bootstrap()`, donc en rejet non traité, et Node arrêtait le
 * processus. Une ingestion de paiements qui ne peut pas déclarer son flux
 * faisait tomber Nolaa HQ tout entier.
 *
 * Ces tests fixent le même contrat que pour l'ingestion de support : le
 * bootstrap se plaint, il ne propage pas.
 */

mock.module('@nola-hq/nola-sdk', () => ({ NolaClientService: class {} }));

/** Ce que le bus a fait, pour vérifier qu'on tente quand même de consommer. */
const calls: { ensureStream: number; consume: string[] } = { ensureStream: 0, consume: [] };
let ensureStreamFails = false;
let consumeFails = false;

mock.module('@nola-studio/sdk', () => ({
  EventBus: class {
    async init() {}
    async ensureStream() {
      calls.ensureStream += 1;
      if (ensureStreamFails) {
        throw new Error('subjects overlap with an existing stream');
      }
    }
    async consume(stream: string, consumer: string) {
      calls.consume.push(`${stream}/${consumer}`);
      if (consumeFails) throw new Error('no responders');
    }
  },
}));

const { PaymentEventsListener } = await import('./payment-events.listener');

function listener(env: Record<string, string> = {}) {
  calls.ensureStream = 0;
  calls.consume = [];
  const nolaClient = { isReady: () => true, getClient: () => ({}) } as never;
  const config = { get: (key: string) => env[key] } as never;
  return new PaymentEventsListener(nolaClient, {} as never, config);
}

describe('le bootstrap de l’ingestion de paiements', () => {
  test('un flux refusé ne fait pas tomber l’application', async () => {
    ensureStreamFails = true;
    consumeFails = false;
    const l = listener();

    // Ne doit pas rejeter : c'est exactement ce qui tuait le processus.
    await (l as unknown as { bootstrap(): Promise<void> }).bootstrap();
    expect(calls.ensureStream).toBe(1);
  });

  /**
   * Le refus de créer le flux ne dit pas qu'il n'existe pas — il dit souvent
   * l'inverse. On tente donc de consommer quand même ; c'est le binding qui
   * tranche.
   */
  test('après un flux refusé, on tente quand même de consommer', async () => {
    ensureStreamFails = true;
    consumeFails = false;
    const l = listener();

    await (l as unknown as { bootstrap(): Promise<void> }).bootstrap();
    expect(calls.consume).toHaveLength(PaymentEventsListener.SOURCES.length);
  });

  /**
   * Un paiement n'est pas perdu quand un consumer ne se lie pas : il reste
   * dans le flux, et le prochain démarrage le reprendra. Tuer le processus,
   * en revanche, emportait aussi la facturation qui fonctionnait.
   */
  test('un consumer qui ne se lie pas n’emporte ni les autres ni l’application', async () => {
    ensureStreamFails = false;
    consumeFails = true;
    const l = listener();

    await (l as unknown as { bootstrap(): Promise<void> }).bootstrap();
    expect(calls.consume).toHaveLength(PaymentEventsListener.SOURCES.length);
  });

  /**
   * Le remède quand un flux de plateforme possède déjà les sujets : pointer
   * HQ dessus, sans changer le code. La même variable que pour les trois
   * autres écouteurs — un seul réglage pour tout HQ.
   */
  test('NOLA_HQ_EVENTS_STREAM choisit le flux à consommer', async () => {
    ensureStreamFails = false;
    consumeFails = false;
    const l = listener({ NOLA_HQ_EVENTS_STREAM: 'NOLA_EVENTS' });

    await (l as unknown as { bootstrap(): Promise<void> }).bootstrap();
    for (const call of calls.consume) expect(call.startsWith('NOLA_EVENTS/')).toBe(true);
  });

  test('sans variable, le flux historique est conservé', async () => {
    ensureStreamFails = false;
    consumeFails = false;
    const l = listener();

    await (l as unknown as { bootstrap(): Promise<void> }).bootstrap();
    for (const call of calls.consume) expect(call.startsWith('NOLA_HQ_EVENTS/')).toBe(true);
  });
});
