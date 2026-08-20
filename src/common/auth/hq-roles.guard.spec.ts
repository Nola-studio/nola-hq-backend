import { test, expect, describe } from 'bun:test';
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HqRole, hasHqRole } from './hq-role.enum';
import { HqRolesGuard } from './hq-roles.guard';

describe('hasHqRole', () => {
  test('owner satisfies operator and viewer requirements', () => {
    expect(hasHqRole([HqRole.Owner], HqRole.Owner)).toBe(true);
    expect(hasHqRole([HqRole.Owner], HqRole.Operator)).toBe(true);
    expect(hasHqRole([HqRole.Owner], HqRole.Viewer)).toBe(true);
  });

  test('operator satisfies viewer but not owner', () => {
    expect(hasHqRole([HqRole.Operator], HqRole.Viewer)).toBe(true);
    expect(hasHqRole([HqRole.Operator], HqRole.Operator)).toBe(true);
    expect(hasHqRole([HqRole.Operator], HqRole.Owner)).toBe(false);
  });

  test('viewer satisfies only viewer', () => {
    expect(hasHqRole([HqRole.Viewer], HqRole.Viewer)).toBe(true);
    expect(hasHqRole([HqRole.Viewer], HqRole.Operator)).toBe(false);
    expect(hasHqRole([HqRole.Viewer], HqRole.Owner)).toBe(false);
  });

  test('a user with no hq:* role never passes, even for the weakest requirement', () => {
    expect(hasHqRole([], HqRole.Viewer)).toBe(false);
    expect(hasHqRole(['school_admin', 'teacher'], HqRole.Viewer)).toBe(false);
  });
});

/** Minimal ExecutionContext double — only what canActivate() reads. */
function makeContext(userRoles: string[] | undefined): ExecutionContext {
  const req = { user: userRoles ? { roles: userRoles } : undefined };
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

/** Reflector double returning a fixed metadata value regardless of target. */
function makeReflector(required: HqRole[] | undefined): Reflector {
  return {
    getAllAndOverride: () => required,
  } as unknown as Reflector;
}

describe('HqRolesGuard.canActivate', () => {
  test('a route with NO @HqRoles decorator is allowed through (auth-only, no role gate) — current documented convention, not a role check', () => {
    const guard = new HqRolesGuard(makeReflector(undefined));
    expect(guard.canActivate(makeContext([HqRole.Viewer]))).toBe(true);
    expect(guard.canActivate(makeContext([]))).toBe(true);
  });

  test('an empty @HqRoles([]) array is treated the same as no decorator — allowed', () => {
    const guard = new HqRolesGuard(makeReflector([]));
    expect(guard.canActivate(makeContext([]))).toBe(true);
  });

  test('user holding the exact required role is allowed', () => {
    const guard = new HqRolesGuard(makeReflector([HqRole.Operator]));
    expect(guard.canActivate(makeContext([HqRole.Operator]))).toBe(true);
  });

  test('user holding a stronger role is allowed (hierarchy)', () => {
    const guard = new HqRolesGuard(makeReflector([HqRole.Operator]));
    expect(guard.canActivate(makeContext([HqRole.Owner]))).toBe(true);
  });

  test('user holding only a weaker role is denied with insufficient_hq_role', () => {
    const guard = new HqRolesGuard(makeReflector([HqRole.Operator]));
    expect(() => guard.canActivate(makeContext([HqRole.Viewer]))).toThrow(
      ForbiddenException,
    );
  });

  test('unauthenticated request (no req.user) on a protected route is denied', () => {
    const guard = new HqRolesGuard(makeReflector([HqRole.Viewer]));
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(
      ForbiddenException,
    );
  });

  test('denial reports only hq:* roles held, filtering out unrelated realm roles', () => {
    const guard = new HqRolesGuard(makeReflector([HqRole.Owner]));
    try {
      guard.canActivate(makeContext(['school_admin', HqRole.Viewer]));
      throw new Error('expected canActivate to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      const response = (err as ForbiddenException).getResponse() as {
        code: string;
        required: HqRole[];
        held: string[];
      };
      expect(response.code).toBe('insufficient_hq_role');
      expect(response.required).toEqual([HqRole.Owner]);
      expect(response.held).toEqual([HqRole.Viewer]);
    }
  });
});
