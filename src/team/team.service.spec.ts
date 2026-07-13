import { test, expect, describe, mock } from 'bun:test';
import { TeamService } from './team.service';

/**
 * Auto Keycloak provisioning on invite. The repository, KeycloakAdminService and
 * ConfigService are mocked — no DB, no Keycloak. We assert the outcome shape:
 * degraded mode, fresh-account creation (temp password + role), and the
 * existing-account path (no password clobber).
 */

function makeRepo() {
  return {
    findOne: mock(async () => null), // no duplicate team_members row
    create: (x: unknown) => x,
    save: async (x: unknown) => x,
  } as any;
}

const config = { get: (_k: string) => undefined } as any; // realm falls back to 'nola-hq'

const invite = {
  name: 'Awa Diop',
  email: 'awa@nola.cd',
  role: 'Support N1',
};

describe('TeamService.invite → Keycloak provisioning', () => {
  test('degraded mode (admin not configured) → row created, reason surfaced', async () => {
    const kc = { isConfigured: () => false } as any;
    const svc = new TeamService(makeRepo(), kc, config);
    const res = await svc.invite({ ...invite });
    expect(res.email).toBe('awa@nola.cd');
    expect(res.keycloak).toEqual({ created: false, reason: 'keycloak_admin_not_configured' });
  });

  test('new account + realm SMTP → "set your password" email, NO temp password', async () => {
    const kc = {
      isConfigured: () => true,
      findUserByEmail: mock(async () => null),
      createUser: mock(async () => 'kc-user-1'),
      executeActionsEmail: mock(async () => true),
      resetPassword: mock(async () => true),
      assignRealmRole: mock(async () => true),
    } as any;
    const svc = new TeamService(makeRepo(), kc, config);

    const res = await svc.invite({ ...invite, hqAccess: 'operator' });
    expect(res.keycloak.created).toBe(true);
    expect(res.keycloak.userId).toBe('kc-user-1');
    expect(res.keycloak.realmRole).toBe('hq:operator');
    expect(res.keycloak.emailSent).toBe(true);
    expect(res.keycloak.temporaryPassword).toBeUndefined();
    expect(kc.resetPassword).not.toHaveBeenCalled(); // no password transits
    expect(kc.createUser.mock.calls[0][0]).toBe('nola-hq');
    expect(kc.executeActionsEmail.mock.calls[0][2]).toEqual(['UPDATE_PASSWORD']);
    expect(kc.assignRealmRole.mock.calls[0][2]).toBe('hq:operator');
  });

  test('new account, email send fails → falls back to a temp password', async () => {
    const kc = {
      isConfigured: () => true,
      findUserByEmail: mock(async () => null),
      createUser: mock(async () => 'kc-user-1b'),
      executeActionsEmail: mock(async () => false), // realm without SMTP
      resetPassword: mock(async () => true),
      assignRealmRole: mock(async () => true),
    } as any;
    const svc = new TeamService(makeRepo(), kc, config);

    const res = await svc.invite({ ...invite, hqAccess: 'operator' });
    expect(res.keycloak.created).toBe(true);
    expect(res.keycloak.emailSent).toBe(false);
    expect(res.keycloak.passwordSet).toBe(true);
    expect(typeof res.keycloak.temporaryPassword).toBe('string');
    expect(res.keycloak.temporaryPassword!.length).toBeGreaterThanOrEqual(12);
    expect(kc.resetPassword.mock.calls[0][3]).toBe(true); // temporary=true
  });

  test('defaults to the least-privilege role (hq:viewer)', async () => {
    const kc = {
      isConfigured: () => true,
      findUserByEmail: mock(async () => null),
      createUser: mock(async () => 'kc-user-2'),
      executeActionsEmail: mock(async () => true),
      resetPassword: mock(async () => true),
      assignRealmRole: mock(async () => true),
    } as any;
    const svc = new TeamService(makeRepo(), kc, config);
    const res = await svc.invite({ ...invite }); // no hqAccess
    expect(res.keycloak.realmRole).toBe('hq:viewer');
  });

  test('existing account → no password clobber, role ensured', async () => {
    const kc = {
      isConfigured: () => true,
      findUserByEmail: mock(async () => ({ id: 'kc-existing', email: invite.email })),
      createUser: mock(async () => 'should-not-be-called'),
      resetPassword: mock(async () => true),
      assignRealmRole: mock(async () => true),
    } as any;
    const svc = new TeamService(makeRepo(), kc, config);
    const res = await svc.invite({ ...invite, hqAccess: 'owner' });
    expect(res.keycloak).toMatchObject({
      created: false,
      existed: true,
      userId: 'kc-existing',
      realmRole: 'hq:owner',
    });
    expect(res.keycloak.temporaryPassword).toBeUndefined();
    expect(kc.createUser).not.toHaveBeenCalled();
    expect(kc.resetPassword).not.toHaveBeenCalled();
  });
});
