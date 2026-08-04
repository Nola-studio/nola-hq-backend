import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { StudioTask } from './studio-task.entity';
import { StudioNotificationDedup } from './studio-notification-dedup.entity';
import { StudioNotifyService } from './studio-notify.service';

/**
 * Nudges assignees about tasks due within 48h. Runs once a day; a task only
 * ever gets one due_soon notification per calendar day, enforced by
 * `StudioNotificationDedup`'s unique (taskId, kind, sentOn) constraint
 * rather than an in-memory check, so it stays correct across
 * restarts/multiple instances.
 */
@Injectable()
export class StudioDueSoonScheduler {
  private readonly logger = new Logger(StudioDueSoonScheduler.name);

  constructor(
    @InjectRepository(StudioTask)
    private readonly tasks: Repository<StudioTask>,
    @InjectRepository(StudioNotificationDedup)
    private readonly dedups: Repository<StudioNotificationDedup>,
    private readonly notify: StudioNotifyService,
  ) {}

  @Cron('0 8 * * *', { timeZone: 'America/Toronto' })
  async handleCron() {
    await this.run();
  }

  async run() {
    const today = new Date().toISOString().slice(0, 10);
    const in48h = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const where: FindOptionsWhere<StudioTask> = {
      dueDate: MoreThanOrEqual(today),
      status: Not('done'),
    };
    const dueSoon = await this.tasks.find({ where });
    const withinWindow = dueSoon.filter((t) => t.dueDate && t.dueDate <= in48h && t.assigneeEmail);

    for (const task of withinWindow) {
      if (!task.assigneeEmail || !task.dueDate) continue;

      try {
        await this.dedups.save(
          this.dedups.create({ taskId: task.id, kind: 'due_soon', sentOn: today, createdAt: new Date() }),
        );
      } catch {
        // Unique constraint violation ⇒ already notified today for this task.
        continue;
      }

      await this.notify.taskDueSoon({
        identifier: task.identifier,
        title: task.title,
        assigneeEmail: task.assigneeEmail,
        dueDate: task.dueDate,
      });
      this.logger.log(`due_soon notified for ${task.identifier}`);
    }
  }
}
