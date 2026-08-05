import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoadmapInitiative } from '../roadmap/roadmap-initiative.entity';
import { WorkItem } from '../work-items/work-item.entity';
import { TeamMember } from '../team/team-member.entity';
import {
  WORK_ITEM_PRIORITY_TO_STUDIO_PRIORITY,
  WORK_ITEM_STATUS_TO_STUDIO_STATUS,
} from '../work-items/work-item-studio-mapping';
import { StudioExpense } from './studio-expense.entity';
import { StudioDomain } from './studio-domain.entity';
import { StudioRecurring } from './studio-recurring.entity';
import { resolvePeriod } from './studio.dashboard-period';
import {
  buildSectionA,
  buildSectionB,
  withCrossSectionCost,
  type DashboardProject,
  type DashboardTask,
  type SectionA,
  type SectionB,
} from './studio.dashboard-workbook';
import { GetDashboardDto } from './dto/get-dashboard.dto';

export interface StudioDashboard {
  period: { start: string; end: string; label: string };
  sectionA: SectionA;
  sectionB: SectionB;
}

/** `RoadmapInitiative.priority` (P0-P3) → Studio's original 3-value scale for the donut. */
const ROADMAP_PRIORITY_TO_STUDIO: Record<string, 'high' | 'medium' | 'low'> = {
  P0: 'high',
  P1: 'high',
  P2: 'medium',
  P3: 'low',
};

/**
 * Single aggregate payload for the Studio dashboard tab — two sections
 * mirroring the "Project Management Dashboard" workbook exactly ("Projets
 * & Tâches" / "Dépenses & Abonnements"), both filtered by the same period.
 * Pure aggregation logic lives in `studio.dashboard-workbook.ts` /
 * `studio.dashboard-period.ts`; this service is just the DB round trip.
 *
 * Post-merge, "projects" and "tasks" read from `roadmap_initiatives`/
 * `work_items` (the unified backbone) rather than the retired
 * `studio_projects`/`studio_tasks` — the rows below translate each entity's
 * shape back into Studio's original vocabulary so this dashboard keeps
 * rendering exactly as it did before (same donut buckets, same fields).
 * `RoadmapInitiative` has no `budget`/`cost` columns, so those always read
 * as 0 here — the real workbook has them empty for every project anyway.
 */
@Injectable()
export class StudioDashboardService {
  constructor(
    @InjectRepository(RoadmapInitiative)
    private readonly projects: Repository<RoadmapInitiative>,
    @InjectRepository(WorkItem)
    private readonly tasks: Repository<WorkItem>,
    @InjectRepository(TeamMember)
    private readonly team: Repository<TeamMember>,
    @InjectRepository(StudioExpense)
    private readonly expenses: Repository<StudioExpense>,
    @InjectRepository(StudioDomain)
    private readonly domains: Repository<StudioDomain>,
    @InjectRepository(StudioRecurring)
    private readonly recurring: Repository<StudioRecurring>,
  ) {}

  async get(query: GetDashboardDto = {}): Promise<StudioDashboard> {
    const today = new Date().toISOString().slice(0, 10);
    const range = resolvePeriod(query, today);

    const [allProjects, allTasks, allTeam, allExpenses, allDomains, allRecurring] = await Promise.all([
      this.projects.find(),
      this.tasks.find(),
      this.team.find(),
      this.expenses.find(),
      this.domains.find(),
      this.recurring.find(),
    ]);
    const emailById = new Map(allTeam.map((m) => [m.id, m.email]));

    const dashboardProjects: DashboardProject[] = allProjects.map((p) => ({
      type: p.type,
      priority: ROADMAP_PRIORITY_TO_STUDIO[p.priority] ?? null,
      healthStatus: p.healthStatus,
      budget: null,
      cost: null,
      startDate: p.startDate,
      dueDate: p.targetDate,
    }));
    const dashboardTasks: DashboardTask[] = allTasks.map((t) => ({
      status: WORK_ITEM_STATUS_TO_STUDIO_STATUS[t.status],
      priority: WORK_ITEM_PRIORITY_TO_STUDIO_PRIORITY[t.priority],
      assigneeEmail: (t.assignee && emailById.get(t.assignee)) ?? null,
      dueDate: t.dueDate,
      hoursSpent: t.hoursSpent,
    }));

    const sectionA = buildSectionA(dashboardProjects, dashboardTasks, range, today);
    const sectionB = buildSectionB(allExpenses, allDomains, allRecurring, range);

    return {
      period: range,
      sectionA: withCrossSectionCost(sectionA, sectionB),
      sectionB,
    };
  }
}
