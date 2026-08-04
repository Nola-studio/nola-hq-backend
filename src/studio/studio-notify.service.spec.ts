import { test, expect, describe, mock } from 'bun:test';

// See studio-tasks.service.spec.ts for why this stub is needed.
mock.module('@nola-hq/nola-sdk', () => ({ NolaClientService: class {} }));

const { StudioNotifyService } = await import('./studio-notify.service');

function makeNolaClient(ready = true) {
  const publish = mock(async () => {});
  return { isReady: mock(() => ready), getClient: mock(() => ({ publish })), _publish: publish } as any;
}

function makeTeamRepo(rows: any[] = []) {
  return { findOne: mock(async ({ where }: any) => rows.find((r) => r.email === where.email) ?? null) } as any;
}

describe('StudioNotifyService', () => {
  test('publishes task.assigned with the resolved display name', async () => {
    const client = makeNolaClient();
    const team = makeTeamRepo([{ email: 'a@nola.dev', name: 'Alice' }]);
    const svc = new StudioNotifyService(client, team);

    await svc.taskAssigned({ identifier: 'YEK-1', title: 'Ship it', assigneeEmail: 'a@nola.dev', dueDate: '2026-08-20' });

    expect(client._publish).toHaveBeenCalledWith(
      'nola.commands.notify.send',
      expect.objectContaining({
        channel: 'email',
        to: 'a@nola.dev',
        template: 'studio.task_assigned',
        variables: expect.objectContaining({ assigneeName: 'Alice', identifier: 'YEK-1' }),
      }),
    );
  });

  test('falls back to the email itself when no team member matches', async () => {
    const client = makeNolaClient();
    const team = makeTeamRepo([]);
    const svc = new StudioNotifyService(client, team);

    await svc.taskDueSoon({ identifier: 'YEK-2', title: 'B', assigneeEmail: 'ghost@nola.dev', dueDate: '2026-08-20' });

    expect(client._publish).toHaveBeenCalledWith(
      'nola.commands.notify.send',
      expect.objectContaining({ variables: expect.objectContaining({ assigneeName: 'ghost@nola.dev' }) }),
    );
  });

  test('skips publishing when the NATS client is not ready', async () => {
    const client = makeNolaClient(false);
    const team = makeTeamRepo();
    const svc = new StudioNotifyService(client, team);

    await svc.taskAssigned({ identifier: 'YEK-1', title: 'Ship it', assigneeEmail: 'a@nola.dev', dueDate: null });

    expect(client.getClient).not.toHaveBeenCalled();
  });
});
