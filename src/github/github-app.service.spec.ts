import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { GithubAppService } from './github-app.service';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  delete process.env.GITHUB_APP_ID;
  delete process.env.GITHUB_APP_SLUG;
  delete process.env.GITHUB_APP_PRIVATE_KEY;
  delete process.env.GITHUB_API_URL;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function configure() {
  process.env.GITHUB_APP_ID = '4831187';
  process.env.GITHUB_APP_SLUG = 'nolaahq';
  process.env.GITHUB_APP_PRIVATE_KEY = privateKey;
  return new GithubAppService(new ConfigService());
}

/** Un faux GitHub : chaque appel est enregistré, chaque route rend ce qu'on veut. */
function fakeGithub(routes: Record<string, { status?: number; body: unknown }>) {
  const calls: { path: string; method: string; auth: string }[] = [];
  globalThis.fetch = mock(async (url: any, init: any = {}) => {
    const path = String(url).replace('https://api.github.com', '');
    calls.push({
      path,
      method: init.method ?? 'GET',
      auth: String(init.headers?.Authorization ?? ''),
    });
    const route = routes[`${init.method ?? 'GET'} ${path}`] ?? routes[path];
    if (!route) return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
    return new Response(JSON.stringify(route.body), {
      status: route.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as any;
  return calls;
}

const IN_AN_HOUR = () => new Date(Date.now() + 3_600_000).toISOString();

describe('status', () => {
  /** Une App non branchée n'est pas une panne — l'écran doit pouvoir le dire. */
  test('sans configuration, « unconfigured » et aucun appel réseau', async () => {
    const calls = fakeGithub({});
    const res = await new GithubAppService(new ConfigService()).status();

    expect(res.status).toBe('unconfigured');
    expect(res.configured).toBe(false);
    expect(res.error).toContain('GITHUB_APP_ID');
    expect(calls).toHaveLength(0);
  });

  test('configurée et reconnue, « connected » avec le lien d’installation', async () => {
    const svc = configure();
    fakeGithub({
      '/app': { body: { id: 4831187, slug: 'nolaahq' } },
      '/app/installations': { body: [] },
    });

    const res = await svc.status();
    expect(res.status).toBe('connected');
    expect(res.appId).toBe('4831187');
    expect(res.installUrl).toBe('https://github.com/apps/nolaahq/installations/new');
  });

  /**
   * Le piège le plus courant : une App créée mais jamais installée existe,
   * s'authentifie, et n'a accès à rien. Une liste vide n'est pas une erreur —
   * c'est la réponse.
   */
  test('une App jamais installée est « connected » avec zéro installation', async () => {
    const svc = configure();
    fakeGithub({
      '/app': { body: { id: 4831187, slug: 'nolaahq' } },
      '/app/installations': { body: [] },
    });

    const res = await svc.status();
    expect(res.status).toBe('connected');
    expect(res.installations).toEqual([]);
  });

  /** Installée, oui — mais sur quels dépôts ? C'est l'autre moitié du piège. */
  test('le périmètre de chaque installation est rapporté', async () => {
    const svc = configure();
    fakeGithub({
      '/app': { body: { id: 4831187, slug: 'nolaahq' } },
      '/app/installations': {
        body: [
          { id: 77, account: { login: 'Nola-studio' }, repository_selection: 'selected' },
          { id: 78, account: { login: 'greg' }, repository_selection: 'all' },
        ],
      },
    });

    expect((await svc.status()).installations).toEqual([
      { id: 77, account: 'Nola-studio', repositorySelection: 'selected' },
      { id: 78, account: 'greg', repositorySelection: 'all' },
    ]);
  });

  test('une installation sans compte lisible ne fait pas tomber le statut', async () => {
    const svc = configure();
    fakeGithub({
      '/app': { body: { id: 4831187, slug: 'nolaahq' } },
      '/app/installations': { body: [{ id: 77, account: null }] },
    });

    expect((await svc.status()).installations).toEqual([
      { id: 77, account: '(compte inconnu)', repositorySelection: 'selected' },
    ]);
  });

  /** Une clé refusée doit se voir, pas se confondre avec « pas configuré ». */
  test('une clé que GitHub refuse donne « error », pas « unconfigured »', async () => {
    const svc = configure();
    fakeGithub({ '/app': { status: 401, body: { message: "A JSON web token could not be decoded" } } });

    const res = await svc.status();
    expect(res.status).toBe('error');
    expect(res.configured).toBe(true);
    expect(res.error).toContain('401');
    expect(res.error).toContain('could not be decoded');
  });

  test('le lien d’installation reste donné même quand GitHub refuse', async () => {
    const svc = configure();
    fakeGithub({ '/app': { status: 401, body: { message: 'nope' } } });
    const res = await svc.status();
    expect(res.installUrl).toBe('https://github.com/apps/nolaahq/installations/new');
    expect(res.installations).toEqual([]);
  });
});

describe('installationIdFor', () => {
  test('résout l’installation d’un dépôt', async () => {
    const svc = configure();
    fakeGithub({ '/repos/nola-studio/nola-hq/installation': { body: { id: 77 } } });

    expect(await svc.installationIdFor('nola-studio', 'nola-hq')).toBe(77);
  });

  /** Cet appel précède tous les autres : le refaire à chaque fois serait absurde. */
  test('le résultat est mis en cache, sans distinguer la casse', async () => {
    const svc = configure();
    const calls = fakeGithub({ '/repos/nola-studio/nola-hq/installation': { body: { id: 77 } } });

    await svc.installationIdFor('nola-studio', 'nola-hq');
    await svc.installationIdFor('Nola-Studio', 'Nola-HQ');

    expect(calls.filter((c) => c.path.endsWith('/installation'))).toHaveLength(1);
  });

  /**
   * Le message doit dire quoi faire. « GitHub a répondu 404 » enverrait
   * chercher un bug là où il n'y a qu'une App pas encore installée.
   */
  test('une App non installée dit d’installer l’App, pas « 404 »', async () => {
    const svc = configure();
    fakeGithub({});

    await expect(svc.installationIdFor('nola-studio', 'inconnu')).rejects.toThrow(
      ServiceUnavailableException,
    );
    await expect(svc.installationIdFor('nola-studio', 'inconnu')).rejects.toThrow(/installez-la/i);
  });

  /** Un 404 ne se met pas en cache : c'est l'état qu'on veut voir changer. */
  test('un échec n’est pas mémorisé', async () => {
    const svc = configure();
    const calls = fakeGithub({});

    await expect(svc.installationIdFor('nola-studio', 'inconnu')).rejects.toThrow();
    await expect(svc.installationIdFor('nola-studio', 'inconnu')).rejects.toThrow();

    expect(calls.filter((c) => c.path.endsWith('/installation'))).toHaveLength(2);
  });
});

describe('installationToken', () => {
  test('demande un jeton et le réutilise tant qu’il vaut', async () => {
    const svc = configure();
    const calls = fakeGithub({
      'POST /app/installations/77/access_tokens': { body: { token: 'ghs_x', expires_at: IN_AN_HOUR() } },
    });

    expect(await svc.installationToken(77)).toBe('ghs_x');
    expect(await svc.installationToken(77)).toBe('ghs_x');
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  /** Un jeton qui expire dans trente secondes ne servira pas l'appel suivant. */
  test('un jeton proche de son terme est renouvelé', async () => {
    const svc = configure();
    let n = 0;
    globalThis.fetch = mock(async () => {
      n += 1;
      return new Response(
        JSON.stringify({ token: `ghs_${n}`, expires_at: new Date(Date.now() + 30_000).toISOString() }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as any;

    expect(await svc.installationToken(77)).toBe('ghs_1');
    expect(await svc.installationToken(77)).toBe('ghs_2');
  });

  test('deux installations ont chacune leur jeton', async () => {
    const svc = configure();
    fakeGithub({
      'POST /app/installations/77/access_tokens': { body: { token: 'ghs_a', expires_at: IN_AN_HOUR() } },
      'POST /app/installations/88/access_tokens': { body: { token: 'ghs_b', expires_at: IN_AN_HOUR() } },
    });

    expect(await svc.installationToken(77)).toBe('ghs_a');
    expect(await svc.installationToken(88)).toBe('ghs_b');
  });
});

describe('fetchRepository', () => {
  test('retient ce dont HQ a besoin et rien de plus', async () => {
    const svc = configure();
    fakeGithub({
      '/repos/nola-studio/nola-hq/installation': { body: { id: 77 } },
      'POST /app/installations/77/access_tokens': { body: { token: 'ghs_x', expires_at: IN_AN_HOUR() } },
      '/repos/nola-studio/nola-hq': {
        body: {
          id: 987654321,
          name: 'nola-hq',
          owner: { login: 'nola-studio' },
          default_branch: 'main',
          visibility: 'private',
          private: true,
          archived: false,
          html_url: 'https://github.com/nola-studio/nola-hq',
          description: 'Console Nolaa HQ',
          stargazers_count: 3,
        },
      },
    });

    const facts = await svc.fetchRepository('nola-studio', 'nola-hq');
    expect(facts).toEqual({
      externalId: '987654321',
      owner: 'nola-studio',
      name: 'nola-hq',
      defaultBranch: 'main',
      visibility: 'private',
      archived: false,
      htmlUrl: 'https://github.com/nola-studio/nola-hq',
      description: 'Console Nolaa HQ',
    });
  });

  /**
   * La chaîne complète, dans l'ordre : JWT d'App pour trouver l'installation
   * et émettre le jeton, puis jeton d'installation pour lire le dépôt.
   */
  test('la lecture du dépôt utilise le jeton d’installation, pas le JWT d’App', async () => {
    const svc = configure();
    const calls = fakeGithub({
      '/repos/o/r/installation': { body: { id: 5 } },
      'POST /app/installations/5/access_tokens': { body: { token: 'ghs_secret', expires_at: IN_AN_HOUR() } },
      '/repos/o/r': {
        body: {
          id: 1, name: 'r', owner: { login: 'o' }, default_branch: 'main',
          private: true, archived: false, html_url: 'u', description: null,
        },
      },
    });

    await svc.fetchRepository('o', 'r');

    expect(calls.map((c) => c.path)).toEqual([
      '/repos/o/r/installation',
      '/app/installations/5/access_tokens',
      '/repos/o/r',
    ]);
    // Les deux premiers portent un JWT (trois segments), le dernier le jeton.
    expect(calls[0].auth.split('.')).toHaveLength(3);
    expect(calls[2].auth).toBe('Bearer ghs_secret');
  });

  /** GitHub fait autorité sur la casse : un dépôt re-capitalisé s'aligne sur lui. */
  test('la casse renvoyée par GitHub gagne', async () => {
    const svc = configure();
    fakeGithub({
      '/repos/nola-studio/nola-hq/installation': { body: { id: 5 } },
      'POST /app/installations/5/access_tokens': { body: { token: 't', expires_at: IN_AN_HOUR() } },
      '/repos/nola-studio/nola-hq': {
        body: {
          id: 1, name: 'Nola-HQ', owner: { login: 'Nola-Studio' }, default_branch: 'trunk',
          private: false, archived: false, html_url: 'u', description: null,
        },
      },
    });

    const facts = await svc.fetchRepository('nola-studio', 'nola-hq');
    expect(facts.owner).toBe('Nola-Studio');
    expect(facts.name).toBe('Nola-HQ');
    expect(facts.defaultBranch).toBe('trunk');
    expect(facts.visibility).toBe('public');
  });
});
