import { test, expect, describe } from 'bun:test';
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

import { HqRole, hasHqRole } from './hq-role.enum';
import { HqRolesGuard } from './hq-roles.guard';
import { HQ_ROLES_KEY } from './hq-roles.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';

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
function makeContext(
  userRoles: string[] | undefined,
  target?: { class?: string; handler?: string },
): ExecutionContext {
  const req = { user: userRoles ? { roles: userRoles } : undefined };
  return {
    getHandler: () => ({ name: target?.handler ?? 'handler' }),
    getClass: () => ({ name: target?.class ?? 'Controller' }),
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

/** Reflector double returning configured metadata for IS_PUBLIC_KEY and HQ_ROLES_KEY. */
function makeReflector(options: { required?: HqRole[]; isPublic?: boolean }): Reflector {
  return {
    getAllAndOverride: (key: string) => {
      if (key === IS_PUBLIC_KEY) return options.isPublic ?? false;
      if (key === HQ_ROLES_KEY) return options.required;
      return undefined;
    },
  } as unknown as Reflector;
}

describe('HqRolesGuard.canActivate (fail-closed)', () => {
  test('a route marked with @Public() is allowed through even with no roles', () => {
    const guard = new HqRolesGuard(makeReflector({ isPublic: true, required: undefined }));
    expect(guard.canActivate(makeContext([]))).toBe(true);
    expect(guard.canActivate(makeContext(undefined))).toBe(true);
  });

  test('GET /auth/me (AuthController.me) is allowed through without roles for session discovery', () => {
    const guard = new HqRolesGuard(makeReflector({ isPublic: false, required: undefined }));
    expect(
      guard.canActivate(
        makeContext([], { class: 'AuthController', handler: 'me' }),
      ),
    ).toBe(true);
    expect(
      guard.canActivate(
        makeContext(['school_admin'], { class: 'AuthController', handler: 'me' }),
      ),
    ).toBe(true);
  });

  test('a route with NO @HqRoles and NOT @Public fails closed with 403 missing_hq_roles_guard', () => {
    const guard = new HqRolesGuard(makeReflector({ isPublic: false, required: undefined }));
    try {
      guard.canActivate(makeContext([HqRole.Owner]));
      throw new Error('expected canActivate to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      const response = (err as ForbiddenException).getResponse() as {
        code: string;
        message: string;
      };
      expect(response.code).toBe('missing_hq_roles_guard');
    }
  });

  test('an empty @HqRoles([]) array fails closed with 403 missing_hq_roles_guard', () => {
    const guard = new HqRolesGuard(makeReflector({ isPublic: false, required: [] }));
    expect(() => guard.canActivate(makeContext([HqRole.Owner]))).toThrow(
      ForbiddenException,
    );
  });

  test('user holding the exact required role is allowed', () => {
    const guard = new HqRolesGuard(makeReflector({ required: [HqRole.Operator] }));
    expect(guard.canActivate(makeContext([HqRole.Operator]))).toBe(true);
  });

  test('user holding a stronger role is allowed (hierarchy)', () => {
    const guard = new HqRolesGuard(makeReflector({ required: [HqRole.Operator] }));
    expect(guard.canActivate(makeContext([HqRole.Owner]))).toBe(true);
  });

  test('user holding only a weaker role is denied with insufficient_hq_role', () => {
    const guard = new HqRolesGuard(makeReflector({ required: [HqRole.Operator] }));
    expect(() => guard.canActivate(makeContext([HqRole.Viewer]))).toThrow(
      ForbiddenException,
    );
  });

  test('unauthenticated request (no req.user) on a protected route is denied', () => {
    const guard = new HqRolesGuard(makeReflector({ required: [HqRole.Viewer] }));
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(
      ForbiddenException,
    );
  });

  test('denial reports only hq:* roles held, filtering out unrelated realm roles', () => {
    const guard = new HqRolesGuard(makeReflector({ required: [HqRole.Owner] }));
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

describe('Exhaustive Route Gating Audit', () => {
  function findControllers(dir: string): string[] {
    let results: string[] = [];
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat && stat.isDirectory()) {
        results = results.concat(findControllers(filePath));
      } else if (file.endsWith('.controller.ts')) {
        results.push(filePath);
      }
    }
    return results;
  }

  const httpMethods = ['Get', 'Post', 'Put', 'Patch', 'Delete', 'Options', 'Head', 'All'];

  test('every route in every controller must have either @Public() or resolve to @HqRoles(...)', () => {
    const srcDir = path.resolve(__dirname, '../../');
    const controllerFiles = findControllers(srcDir);
    expect(controllerFiles.length).toBeGreaterThanOrEqual(40);

    const unprotectedRoutes: string[] = [];

    for (const filePath of controllerFiles) {
      const code = fs.readFileSync(filePath, 'utf-8');
      const sourceFile = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, true);

      function getDecoratorName(decorator: ts.Decorator): string {
        if (ts.isCallExpression(decorator.expression)) {
          return decorator.expression.expression.getText(sourceFile);
        }
        return decorator.expression.getText(sourceFile);
      }

      function getDecoratorArgs(decorator: ts.Decorator): string[] {
        if (ts.isCallExpression(decorator.expression)) {
          return decorator.expression.arguments.map(arg => arg.getText(sourceFile));
        }
        return [];
      }

      ts.forEachChild(sourceFile, function visit(node) {
        if (ts.isClassDeclaration(node)) {
          let classHqRoles: string[] | null = null;
          let classIsPublic = false;

          const classDecorators = ts.canHaveDecorators(node) ? ts.getDecorators(node) : [];
          if (classDecorators) {
            for (const dec of classDecorators) {
              const name = getDecoratorName(dec);
              const args = getDecoratorArgs(dec);
              if (name === 'HqRoles' && args.length > 0) {
                classHqRoles = args;
              }
              if (name === 'Public') {
                classIsPublic = true;
              }
            }
          }

          for (const member of node.members) {
            if (ts.isMethodDeclaration(member)) {
              const methodDecorators = ts.canHaveDecorators(member) ? ts.getDecorators(member) : [];
              let isRoute = false;
              let methodHqRoles: string[] | null = null;
              let methodIsPublic = false;

              if (methodDecorators) {
                for (const dec of methodDecorators) {
                  const name = getDecoratorName(dec);
                  const args = getDecoratorArgs(dec);
                  if (httpMethods.includes(name)) {
                    isRoute = true;
                  }
                  if (name === 'HqRoles' && args.length > 0) {
                    methodHqRoles = args;
                  }
                  if (name === 'Public') {
                    methodIsPublic = true;
                  }
                }
              }

              if (isRoute) {
                const effectiveRoles = methodHqRoles || classHqRoles;
                const isPublic = methodIsPublic || classIsPublic;
                const relPath = path.relative(srcDir, filePath).replace(/\\/g, '/');
                const methodName = member.name.getText(sourceFile);
                const isAuthDiscoveryException =
                  relPath.endsWith('auth/auth.controller.ts') && methodName === 'me';

                if (
                  !isPublic &&
                  !isAuthDiscoveryException &&
                  (!effectiveRoles || effectiveRoles.length === 0)
                ) {
                  const { line } = sourceFile.getLineAndCharacterOfPosition(member.getStart(sourceFile));
                  unprotectedRoutes.push(`${relPath}:${line + 1} (${methodName})`);
                }
              }
            }
          }
        }
        ts.forEachChild(node, visit);
      });
    }

    if (unprotectedRoutes.length > 0) {
      console.error('Found unprotected routes:\n' + unprotectedRoutes.join('\n'));
    }
    expect(unprotectedRoutes).toEqual([]);
  });
});
