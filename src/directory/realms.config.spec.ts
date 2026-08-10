import { test, expect, describe } from 'bun:test';
import { REALMS, realmById, realmForApp } from './realms.config';

/**
 * Rename Kelasi → Yekoli achevé : le realm Keycloak (Phase 4) et l'app id
 * (Phase 8, 2026-08-09) portent tous deux `yekoli`.
 */
describe('realms.config (realm et app id yekoli)', () => {
  test('le realm yekoli existe et porte le libellé Yekoli', () => {
    const realm = realmById('yekoli');
    expect(realm).toBeDefined();
    expect(realm?.label).toBe('Yekoli');
  });

  test("l'ancien id de realm kelasi n'existe plus", () => {
    expect(realmById('kelasi')).toBeUndefined();
  });

  test("l'app id yekoli résout vers le realm yekoli", () => {
    expect(realmForApp('yekoli')?.id).toBe('yekoli');
  });

  test("l'ancien app id kelasi ne résout plus vers aucun realm", () => {
    expect(realmForApp('kelasi')).toBeUndefined();
  });

  test('les ids de realm restent uniques', () => {
    const ids = REALMS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
