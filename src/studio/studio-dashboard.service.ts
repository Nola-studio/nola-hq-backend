import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudioProject } from './studio-project.entity';
import { StudioTask } from './studio-task.entity';
import { StudioExpense } from './studio-expense.entity';
import { StudioDomain } from './studio-domain.entity';
import { StudioRecurring } from './studio-recurring.entity';
import { resolvePeriod } from './studio.dashboard-period';
import { buildSectionA, buildSectionB, withCrossSectionCost, type SectionA, type SectionB } from './studio.dashboard-workbook';
import { GetDashboardDto } from './dto/get-dashboard.dto';

export interface StudioDashboard {
  period: { start: string; end: string; label: string };
  sectionA: SectionA;
  sectionB: SectionB;
}

/**
 * Single aggregate payload for the Studio dashboard tab — two sections
 * mirroring the "Project Management Dashboard" workbook exactly ("Projets
 * & Tâches" / "Dépenses & Abonnements"), both filtered by the same period.
 * Pure aggregation logic lives in `studio.dashboard-workbook.ts` /
 * `studio.dashboard-period.ts`; this service is just the DB round trip.
 */
@Injectable()
export class StudioDashboardService {
  constructor(
    @InjectRepository(StudioProject)
    private readonly projects: Repository<StudioProject>,
    @InjectRepository(StudioTask)
    private readonly tasks: Repository<StudioTask>,
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

    const [allProjects, allTasks, allExpenses, allDomains, allRecurring] = await Promise.all([
      this.projects.find(),
      this.tasks.find(),
      this.expenses.find(),
      this.domains.find(),
      this.recurring.find(),
    ]);

    const sectionA = buildSectionA(allProjects, allTasks, range, today);
    const sectionB = buildSectionB(allExpenses, allDomains, allRecurring, range);

    return {
      period: range,
      sectionA: withCrossSectionCost(sectionA, sectionB),
      sectionB,
    };
  }
}
