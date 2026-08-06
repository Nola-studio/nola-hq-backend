import { test, expect, describe } from 'bun:test';
import { REALMS, realmById, realmForApp } from './realms.config';

/**
 * Phase 4 du rename Kelasi → Yekoli : le realm Keycloak `kelasi` est
 * renommé `yekoli`, mais l'AppId reste `kelasi` jusqu'à la Phase 8.
 */
describe('realms.config (realm yekoli, app id kelasi)', () => {
  test('le realm yekoli existe et porte le libellé Yekoli', () => {
    const realm = realmById('yekoli');
    expect(realm).toBeDefined();
    expect(realm?.label).toBe('Yekoli');
  });

  test("l'ancien id de realm kelasi n'existe plus", () => {
    expect(realmById('kelasi')).toBeUndefined();
  });

  test("l'app id kelasi (inchangé jusqu'à la Phase 8) résout vers le realm yekoli", () => {
    expect(realmForApp('kelasi')?.id).toBe('yekoli');
  });

  test('les ids de realm restent uniques', () => {
    const ids = REALMS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
