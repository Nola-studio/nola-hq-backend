import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoadmapInitiative } from '../roadmap/roadmap-initiative.entity';
import { ProjectRisk } from './project-risk.entity';
import { WorkItemDependency } from './work-item-dependency.entity';
import { WORK_ITEM_STATUSES, WorkItem, isDoneStatus as isDone } from './work-item.entity';
import { WorkSprint } from './work-sprint.entity';
import { WorkItemEvent } from './work-item-event.entity';
import {
  CreateProjectRiskDto,
  CreateWorkSprintDto,
  UpdateProjectRiskDto,
  UpdateWorkSprintDto,
} from './dto/work-planning.dto';

@Injectable()
export class WorkPlanningService {
  constructor(
    @InjectRepository(WorkSprint) private readonly sprints: Repository<WorkSprint>,
    @InjectRepository(WorkItemDependency) private readonly dependencies: Repository<WorkItemDependency>,
    @InjectRepository(ProjectRisk) private readonly risks: Repository<ProjectRisk>,
    @InjectRepository(WorkItem) private readonly items: Repository<WorkItem>,
    @InjectRepository(RoadmapInitiative) private readonly projects: Repository<RoadmapInitiative>,
    @InjectRepository(WorkItemEvent) private readonly events: Repository<WorkItemEvent>,
  ) {}

  private async findProject(id: string) {
    const project = await this.projects.findOne({ where: { id } });
    if (!project) throw new NotFoundException(`Projet ${id} introuvable`);
    return project;
  }

  listSprints(projectId?: string) {
    return this.sprints.find({
      ...(projectId ? { where: { projectId } } : {}),
      order: { startDate: 'DESC', createdAt: 'DESC' },
    });
  }

  async createSprint(dto: CreateWorkSprintDto) {
    await this.findProject(dto.projectId);
    this.assertSprintDates(dto.startDate, dto.endDate);
    if (dto.status === 'active') await this.assertNoActiveSprint(dto.projectId);
    const now = new Date();
    return this.sprints.save(this.sprints.create({
      projectId: dto.projectId,
      name: dto.name.trim(),
      goal: dto.goal?.trim() || null,
      status: dto.status ?? 'planned',
      startDate: dto.startDate ?? null,
      endDate: dto.endDate ?? null,
      createdAt: now,
      updatedAt: now,
    }));
  }

  async updateSprint(id: string, dto: UpdateWorkSprintDto) {
    const sprint = await this.sprints.findOne({ where: { id } });
    if (!sprint) throw new NotFoundException(`Sprint ${id} introuvable`);
    this.assertSprintDates(dto.startDate ?? sprint.startDate, dto.endDate ?? sprint.endDate);
    if (dto.status === 'active' && sprint.status !== 'active' && sprint.projectId) {
      await this.assertNoActiveSprint(sprint.projectId, id);
    }
    Object.assign(sprint, dto);
    sprint.updatedAt = new Date();
    return this.sprints.save(sprint);
  }

  private assertSprintDates(start?: string | null, end?: string | null) {
    if (start && end && end < start) {
      throw new BadRequestException('La fin du sprint doit être postérieure à son début.');
    }
  }

  private async assertNoActiveSprint(projectId: string, excludeId?: string) {
    const active = await this.sprints.findOne({ where: { projectId, status: 'active' } });
    if (active && active.id !== excludeId) {
      throw new ConflictException(`Le sprint « ${active.name} » est déjà actif pour ce projet.`);
    }
  }

  async assertSprint(sprintId: string, projectId: string) {
    const sprint = await this.sprints.findOne({ where: { id: sprintId } });
    if (!sprint) throw new NotFoundException(`Sprint ${sprintId} introuvable`);
    if (sprint.projectId !== projectId) {
      throw new BadRequestException('Le sprint et le ticket doivent appartenir au même projet.');
    }
    return sprint;
  }

  listRisks(projectId: string) {
    return this.risks.find({ where: { projectId }, order: { createdAt: 'DESC' } });
  }

  async createRisk(dto: CreateProjectRiskDto) {
    await this.findProject(dto.projectId);
    const now = new Date();
    return this.risks.save(this.risks.create({
      projectId: dto.projectId,
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      level: dto.level ?? 'medium',
      status: 'open',
      owner: dto.owner || null,
      mitigation: dto.mitigation?.trim() || null,
      createdAt: now,
      updatedAt: now,
    }));
  }

  async updateRisk(id: string, dto: UpdateProjectRiskDto) {
    const risk = await this.risks.findOne({ where: { id } });
    if (!risk) throw new NotFoundException(`Risque ${id} introuvable`);
    Object.assign(risk, dto);
    risk.updatedAt = new Date();
    return this.risks.save(risk);
  }

  dependenciesFor(workItemId: number) {
    return this.dependencies.find({
      where: { workItemId },
      relations: { dependsOn: true },
      order: { createdAt: 'ASC' },
    });
  }

  async addDependency(workItemId: number, dependsOnId: number, actor = 'unknown') {
    if (workItemId === dependsOnId) throw new BadRequestException('Un ticket ne peut pas dépendre de lui-même.');
    const [item, target] = await Promise.all([
      this.items.findOne({ where: { id: workItemId } }),
      this.items.findOne({ where: { id: dependsOnId } }),
    ]);
    if (!item || !target) throw new NotFoundException('Ticket interne introuvable.');
    if (item.projectId !== target.projectId) {
      throw new BadRequestException('Les dépendances inter-projets ne sont pas encore autorisées.');
    }
    if (await this.dependencies.findOne({ where: { workItemId, dependsOnId } })) {
      throw new ConflictException('Cette dépendance existe déjà.');
    }
    if (await this.reaches(dependsOnId, workItemId)) {
      throw new ConflictException('Cette dépendance créerait un cycle.');
    }
    const dependency = await this.dependencies.save(this.dependencies.create({
      workItemId,
      dependsOnId,
      createdAt: new Date(),
    }));
    await this.events.save(this.events.create({
      workItemId,
      actor,
      action: 'updated',
      meta: { dependencyAdded: dependsOnId },
      createdAt: new Date(),
    }));
    return dependency;
  }

  async removeDependency(id: string, actor = 'unknown') {
    const dependency = await this.dependencies.findOne({ where: { id } });
    if (!dependency) throw new NotFoundException(`Dépendance ${id} introuvable`);
    await this.dependencies.delete(id);
    await this.events.save(this.events.create({
      workItemId: dependency.workItemId,
      actor,
      action: 'updated',
      meta: { dependencyRemoved: dependency.dependsOnId },
      createdAt: new Date(),
    }));
    return { ok: true };
  }

  private async reaches(from: number, target: number): Promise<boolean> {
    const seen = new Set<number>();
    const queue = [from];
    while (queue.length) {
      const current = queue.shift()!;
      if (current === target) return true;
      if (seen.has(current)) continue;
      seen.add(current);
      const edges = await this.dependencies.find({ where: { workItemId: current } });
      queue.push(...edges.map((edge) => edge.dependsOnId));
    }
    return false;
  }

  async projectReport(projectId: string) {
    const project = await this.findProject(projectId);
    const [items, risks, sprints] = await Promise.all([
      this.items.find({ where: { projectId } }),
      this.risks.find({ where: { projectId } }),
      this.sprints.find({ where: { projectId }, order: { startDate: 'DESC' } }),
    ]);
    const byStatus = Object.fromEntries(
      WORK_ITEM_STATUSES.map((status) => [status, items.filter((item) => item.status === status).length]),
    );
    const today = new Date().toISOString().slice(0, 10);
    const totalPoints = items.reduce((sum, item) => sum + item.estimatePoints, 0);
    const completedPoints = items
      .filter((item) => isDone(item.status))
      .reduce((sum, item) => sum + item.estimatePoints, 0);
    const done = (byStatus.resolved ?? 0) + (byStatus.closed ?? 0);
    return {
      project: { id: project.id, title: project.title, owner: project.owner, targetDate: project.targetDate },
      totals: {
        tickets: items.length,
        done,
        completionPct: items.length ? Math.round((done / items.length) * 100) : 0,
        totalPoints,
        completedPoints,
        pointsCompletionPct: totalPoints ? Math.round((completedPoints / totalPoints) * 100) : 0,
        blocked: byStatus.blocked ?? 0,
        overdue: items.filter((item) => !isDone(item.status) && item.dueDate && item.dueDate < today).length,
        unassigned: items.filter((item) => !isDone(item.status) && !item.assignee).length,
        openRisks: risks.filter((risk) => risk.status === 'open').length,
        criticalRisks: risks.filter((risk) => risk.status === 'open' && risk.level === 'critical').length,
      },
      byStatus,
      sprints,
      risks,
    };
  }
}
