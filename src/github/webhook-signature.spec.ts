import { describe, expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';
import { verifyGithubSignature } from './webhook-signature';

const SECRET = 'un-secret-de-test';
const BODY = JSON.stringify({ action: 'opened', number: 42 });

function sign(body: string | Buffer, secret = SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

describe('verifyGithubSignature', () => {
  test('une signature valide passe', () => {
    expect(verifyGithubSignature(BODY, sign(BODY), SECRET)).toEqual({ ok: true });
  });

  test('un corps en Buffer se vérifie comme la chaîne équivalente', () => {
    const buf = Buffer.from(BODY, 'utf8');
    expect(verifyGithubSignature(buf, sign(buf), SECRET)).toEqual({ ok: true });
  });

  /**
   * Le piège central : GitHub signe les octets envoyés. Re-sérialiser le JSON
   * analysé change l'espacement et l'ordre des clés — la signature ne
   * correspond plus, et on la croirait invalide.
   */
  test('un corps re-sérialisé ne correspond plus', () => {
    const reserialised = JSON.stringify(JSON.parse(BODY), null, 2);
    expect(verifyGithubSignature(reserialised, sign(BODY), SECRET)).toEqual({
      ok: false,
      reason: 'mismatch',
    });
  });

  test('un octet changé dans le corps invalide', () => {
    expect(verifyGithubSignature(BODY.replace('42', '43'), sign(BODY), SECRET)).toEqual({
      ok: false,
      reason: 'mismatch',
    });
  });

  test('un autre secret invalide', () => {
    expect(verifyGithubSignature(BODY, sign(BODY, 'autre'), SECRET)).toEqual({
      ok: false,
      reason: 'mismatch',
    });
  });

  /** Pas de secret ne veut pas dire « accepter tout le monde ». */
  test('sans secret configuré, rien ne passe — pas même une signature correcte', () => {
    expect(verifyGithubSignature(BODY, sign(BODY), undefined)).toEqual({
      ok: false,
      reason: 'missing-secret',
    });
    expect(verifyGithubSignature(BODY, sign(BODY), '')).toEqual({
      ok: false,
      reason: 'missing-secret',
    });
  });

  test('sans en-tête de signature, rien ne passe', () => {
    expect(verifyGithubSignature(BODY, undefined, SECRET)).toEqual({
      ok: false,
      reason: 'missing-signature',
    });
  });

  describe('en-têtes mal formés', () => {
    test('le préfixe sha1 est refusé — il ne vaut rien', () => {
      const sha1 = `sha1=${createHmac('sha1', SECRET).update(BODY).digest('hex')}`;
      expect(verifyGithubSignature(BODY, sha1, SECRET)).toEqual({
        ok: false,
        reason: 'malformed-signature',
      });
    });

    test('sans préfixe', () => {
      const bare = sign(BODY).slice('sha256='.length);
      expect(verifyGithubSignature(BODY, bare, SECRET)).toEqual({
        ok: false,
        reason: 'malformed-signature',
      });
    });

    /**
     * `Buffer.from('ab', 'hex')` tronque sans se plaindre : une signature de
     * deux caractères produirait un tampon d'un octet, et sans ce contrôle la
     * comparaison porterait sur un octet au lieu de trente-deux.
     */
    test('une signature tronquée est refusée avant toute comparaison', () => {
      expect(verifyGithubSignature(BODY, 'sha256=ab', SECRET)).toEqual({
        ok: false,
        reason: 'malformed-signature',
      });
    });

    test('des caractères non hexadécimaux sont refusés', () => {
      expect(verifyGithubSignature(BODY, `sha256=${'z'.repeat(64)}`, SECRET)).toEqual({
        ok: false,
        reason: 'malformed-signature',
      });
    });

    test('une signature vide est refusée', () => {
      expect(verifyGithubSignature(BODY, 'sha256=', SECRET)).toEqual({
        ok: false,
        reason: 'malformed-signature',
      });
    });
  });

  test('la casse de l’hexadécimal ne change rien', () => {
    const upper = sign(BODY).toUpperCase().replace('SHA256=', 'sha256=');
    expect(verifyGithubSignature(BODY, upper, SECRET)).toEqual({ ok: true });
  });

  test('un corps vide reste vérifiable', () => {
    expect(verifyGithubSignature('', sign(''), SECRET)).toEqual({ ok: true });
  });
});
