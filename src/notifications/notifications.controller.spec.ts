import { describe, expect, test, mock } from 'bun:test';
import { BadRequestException } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';

const USER = { sub: 'kc-1', email: 'aurel@nola.dev', realm: 'nola', tenantId: 't-1', roles: [] };

function makeController(opts: { member?: { id: string } | null } = {}) {
  const svc = {
    list: mock(async () => [{ id: 'n-1' }]),
    markRead: mock(async () => ({ id: 'n-1', readAt: new Date() })),
    markAllRead: mock(async () => ({ updated: 2 })),
    clear: mock(async () => ({ id: 'n-1', clearedAt: new Date() })),
    sendTest: mock(async () => ({ published: true, subject: 's', idempotencyKey: 'k' })),
  } as any;
  const teamService = {
    findByEmail: mock(async () => (opts.member === undefined ? { id: 'aurel' } : opts.member)),
  } as any;
  const controller = new NotificationsController(svc, teamService);
  return { controller, svc, teamService };
}

describe('NotificationsController', () => {
  test('list resolves the caller to their TeamMember id and scopes the query to it', async () => {
    const { controller, svc, teamService } = makeController();
    await controller.list(USER as any);
    expect(teamService.findByEmail).toHaveBeenCalledWith('aurel@nola.dev');
    expect(svc.list).toHaveBeenCalledWith('aurel');
  });

  test('markRead scopes to the caller', async () => {
    const { controller, svc } = makeController();
    await controller.markRead('n-1', USER as any);
    expect(svc.markRead).toHaveBeenCalledWith('n-1', 'aurel');
  });

  test('markAllRead scopes to the caller', async () => {
    const { controller, svc } = makeController();
    await controller.markAllRead(USER as any);
    expect(svc.markAllRead).toHaveBeenCalledWith('aurel');
  });

  test('clear scopes to the caller', async () => {
    const { controller, svc } = makeController();
    await controller.clear('n-1', USER as any);
    expect(svc.clear).toHaveBeenCalledWith('n-1', 'aurel');
  });

  test('caller with no TeamMember row — rejected rather than resolved to nothing', async () => {
    const { controller } = makeController({ member: null });
    await expect(controller.list(USER as any)).rejects.toThrow(BadRequestException);
  });
});
