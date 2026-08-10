import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { TeamMember } from '../team/team-member.entity';
import { WorkItem } from '../work-items/work-item.entity';
import { StudioNotificationDedup } from './studio-notification-dedup.entity';
import { StudioNotifyService } from './studio-notify.service';

/**
 * Nudges assignees about tasks due within 48h. Runs once a day; a task only
 * ever gets one due_soon notification per calendar day, enforced by
 * `StudioNotificationDedup`'s unique (taskId, kind, sentOn) constraint
 * rather than an in-memory check, so it stays correct across
 * restarts/multiple instances.
 *
 * Reads `work_items` post-merge (was `studio_tasks`) — `assignee` there is
 * a `team_members.id`, not an email, so it's resolved before notifying.
 */
@Injectable()
export class StudioDueSoonScheduler {
  private readonly logger = new Logger(StudioDueSoonScheduler.name);

  constructor(
    @InjectRepository(WorkItem)
    private readonly tasks: Repository<WorkItem>,
    @InjectRepository(TeamMember)
    private readonly team: Repository<TeamMember>,
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

    const where: FindOptionsWhere<WorkItem> = {
      dueDate: MoreThanOrEqual(today),
      status: Not(In(['resolved', 'closed'])),
    };
    const dueSoon = await this.tasks.find({ where });
    const withinWindow = dueSoon.filter((t) => t.dueDate && t.dueDate <= in48h && t.assignee);
    if (withinWindow.length === 0) return;

    const team = await this.team.find();
    const emailById = new Map(team.map((m) => [m.id, m.notifyEmail || m.email]));

    for (const task of withinWindow) {
      const assigneeEmail = task.assignee ? emailById.get(task.assignee) : undefined;
      if (!assigneeEmail || !task.dueDate) continue;

      try {
        await this.dedups.save(
          this.dedups.create({ taskId: String(task.id), kind: 'due_soon', sentOn: today, createdAt: new Date() }),
        );
      } catch {
        // Unique constraint violation ⇒ already notified today for this task.
        continue;
      }

      await this.notify.taskDueSoon({
        identifier: task.reference ?? String(task.id),
        title: task.title,
        assigneeEmail,
        dueDate: task.dueDate,
      });
      this.logger.log(`due_soon notified for ${task.reference ?? task.id}`);
    }
  }
}
