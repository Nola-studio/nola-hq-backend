import { describe, expect, test } from 'bun:test';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import {
  APP_JWT_CLOCK_SKEW_SECONDS,
  APP_JWT_TTL_SECONDS,
  buildAppJwt,
  normalisePrivateKey,
} from './github-app-jwt';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

function decode(part: string) {
  return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}

const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);

describe('buildAppJwt', () => {
  test('produit trois segments, en-tête RS256', () => {
    const { token } = buildAppJwt('4831187', privateKey, NOW);
    const parts = token.split('.');

    expect(parts).toHaveLength(3);
    expect(decode(parts[0])).toEqual({ alg: 'RS256', typ: 'JWT' });
  });

  test('l’émetteur est l’App ID', () => {
    const { token } = buildAppJwt('4831187', privateKey, NOW);
    expect(decode(token.split('.')[1]).iss).toBe('4831187');
  });

  /**
   * Les deux règles de GitHub, et les seules qui font échouer silencieusement :
   * dix minutes maximum, et pas d'`iat` dans le futur.
   */
  test('la date d’émission est reculée et la durée reste sous dix minutes', () => {
    const { token, expiresAt } = buildAppJwt('4831187', privateKey, NOW);
    const { iat, exp } = decode(token.split('.')[1]);
    const nowSec = Math.floor(NOW / 1000);

    expect(iat).toBe(nowSec - APP_JWT_CLOCK_SKEW_SECONDS);
    expect(exp - iat).toBe(APP_JWT_TTL_SECONDS);
    expect(exp - nowSec).toBeLessThan(600);
    expect(expiresAt).toBe(exp);
  });

  /** Le test qui compte : GitHub vérifiera cette signature avec la clé publique. */
  test('la signature se vérifie avec la clé publique', () => {
    const { token } = buildAppJwt('4831187', privateKey, NOW);
    const [header, payload, signature] = token.split('.');

    const verified = createVerify('RSA-SHA256')
      .update(`${header}.${payload}`)
      .verify(publicKey, Buffer.from(signature.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));

    expect(verified).toBe(true);
  });

  test('un jeton falsifié ne se vérifie plus', () => {
    const { token } = buildAppJwt('4831187', privateKey, NOW);
    const [header, , signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ iat: 0, exp: 9e9, iss: 'autre' }))
      .toString('base64url');

    const verified = createVerify('RSA-SHA256')
      .update(`${header}.${forged}`)
      .verify(publicKey, Buffer.from(signature.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));

    expect(verified).toBe(false);
  });

  /** Base64url : ni `+`, ni `/`, ni `=` — sinon le jeton casse dans un en-tête. */
  test('l’encodage est bien base64url', () => {
    const { token } = buildAppJwt('4831187', privateKey, NOW);
    expect(token).not.toMatch(/[+/=]/);
  });
});

describe('normalisePrivateKey', () => {
  test('un PEM déjà correct passe tel quel', () => {
    expect(normalisePrivateKey(privateKey)).toBe(privateKey.trim());
  });

  /** Le cas d'une variable d'environnement sur une seule ligne. */
  test('les \\n littéraux sont rétablis, et la clé signe', () => {
    const flattened = privateKey.replace(/\n/g, '\\n');
    const restored = normalisePrivateKey(flattened);

    expect(restored).toBe(privateKey.trim());
    expect(() => buildAppJwt('1', restored, NOW)).not.toThrow();
  });

  test('une clé encodée en base64 est décodée, et signe', () => {
    const encoded = Buffer.from(privateKey).toString('base64');
    const restored = normalisePrivateKey(encoded);

    expect(restored).toBe(privateKey.trim());
    expect(() => buildAppJwt('1', restored, NOW)).not.toThrow();
  });

  test('une clé vide est refusée', () => {
    expect(() => normalisePrivateKey('   ')).toThrow('Clé privée vide.');
  });

  /** Le message doit dire quoi coller, pas « erreur de signature ». */
  test('n’importe quoi d’autre est refusé avec un message utile', () => {
    expect(() => normalisePrivateKey('ma-clé-secrète')).toThrow(/BEGIN|base64/);
  });
});
