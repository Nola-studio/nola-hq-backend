import { describe, expect, mock, test } from 'bun:test';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { MachineClientGuard } from './machine-client.guard';
import { API_SCOPES, hasScopes } from './api-scope';

function context(authorization?: string) {
  const req: any = { headers: authorization ? { authorization } : {} };
  return {
    req,
    ctx: {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => 'handler',
      getClass: () => 'class',
    } as any,
  };
}

function makeGuard(required: string[] | undefined, verify: (token: string) => Promise<any>) {
  const reflector = { getAllAndOverride: mock(() => required) } as any;
  const nolaAuth = { verifyToken: mock(verify) } as any;
  return new MachineClientGuard(reflector, nolaAuth);
}

const CLAIMS = { sub: 'svc-kriver', realm: 'nola-hq', roles: ['execution-reference:write', 'backlog:preview'] };

describe('hasScopes', () => {
  test('exige chaque scope, sans hiérarchie ni joker', () => {
    expect(hasScopes(['backlog:preview'], ['backlog:preview'])).toBe(true);
    expect(hasScopes(['backlog:preview'], ['backlog:write'])).toBe(false);
    expect(hasScopes(['backlog:preview', 'backlog:write'], ['backlog:preview', 'backlog:write'])).toBe(true);
    expect(hasScopes(['backlog:write'], ['backlog:preview', 'backlog:write'])).toBe(false);
  });

  test('les sept scopes du référentiel sont déclarés', () => {
    expect(API_SCOPES).toHaveLength(7);
    expect(API_SCOPES).toContain('execution-reference:parse');
    expect(API_SCOPES).toContain('backlog:sync');
  });
});

describe('MachineClientGuard', () => {
  test('sans en-tête Authorization, refus', async () => {
    const { ctx } = context();
    const guard = makeGuard(undefined, async () => CLAIMS);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  test('un schéma autre que Bearer est ignoré', async () => {
    const { ctx } = context('Basic abc');
    const guard = makeGuard(undefined, async () => CLAIMS);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  /** HQ vérifie, il n'émet pas : un jeton que Nola Auth refuse est refusé ici. */
  test('un jeton que Nola Auth rejette est refusé', async () => {
    const { ctx } = context('Bearer bad');
    const guard = makeGuard(undefined, async () => {
      throw new Error('signature invalide');
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  test('un jeton valide pose le client sur la requête', async () => {
    const { ctx, req } = context('Bearer good');
    const guard = makeGuard(undefined, async () => CLAIMS);

    expect(await guard.canActivate(ctx)).toBe(true);
    expect(req.machineClient).toEqual({
      clientId: 'svc-kriver',
      scopes: ['execution-reference:write', 'backlog:preview'],
      realm: 'nola-hq',
    });
  });

  test('un scope manquant est un 403, pas un 401', async () => {
    const { ctx } = context('Bearer good');
    const guard = makeGuard(['backlog:write'], async () => CLAIMS);
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  test('les scopes détenus laissent passer', async () => {
    const { ctx } = context('Bearer good');
    const guard = makeGuard(['backlog:preview'], async () => CLAIMS);
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  /**
   * Prévisualiser et écrire sont deux scopes distincts : c'est la séparation
   * qu'EXE-05 exige entre une proposition et une mutation du backlog.
   */
  test('prévisualiser ne donne pas le droit d’écrire', async () => {
    const { ctx } = context('Bearer good');
    const guard = makeGuard(['backlog:write'], async () => ({ ...CLAIMS, roles: ['backlog:preview'] }));
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });
});
