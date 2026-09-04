import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkItem, type WorkItemType } from '../work-items/work-item.entity';
import { WorkItemEvent } from '../work-items/work-item-event.entity';
import { branchNameFor, type BranchPrefix } from './branch-name';
import { GithubAppService } from './github-app.service';
import { RepositoriesService } from './repositories.service';
import { CodeRepository } from './repository.entity';
import { WorkItemBranch } from './work-item-branch.entity';

/**
 * Les types qu'on code. Un epic ne se code pas — il se découpe ; une tâche
 * administrative non plus. Le référentiel est explicite : « une tâche non
 * technique ne doit pas être forcée à suivre un workflow GitHub ».
 */
const TECHNICAL_TYPES: WorkItemType[] = ['story', 'task', 'bug', 'spike', 'feature', 'debt'];

/**
 * Ce que « Start Work » peut refuser, et ce qu'il faut faire dans chaque cas.
 *
 * Un bouton simplement absent laisse chercher. C'est la raison d'être de ce
 * type : chaque refus porte sa phrase et son remède, et l'écran n'a rien à
 * réinventer.
 */
export type StartWorkBlocker =
  | 'not-technical'
  | 'already-started'
  | 'closed'
  | 'no-reference'
  | 'no-project'
  | 'no-repository'
  | 'ambiguous-repository';

export interface StartWorkReadiness {
  ready: boolean;
  blocker?: StartWorkBlocker;
  reason?: string;
  /** Les dépôts parmi lesquels choisir. Un seul ⇒ pas de question à poser. */
  repositories: CodeRepository[];
  /** Le nom que la branche portera — montré avant d'agir, jamais après. */
  branchName: string | null;
  /** Les branches déjà liées à ce ticket. */
  existing: WorkItemBranch[];
}

export interface StartWorkResult {
  branch: WorkItemBranch;
  /** `false` quand la branche existait déjà et qu'on l'a simplement reliée. */
  created: boolean;
  workItem: WorkItem;
}

@Injectable()
export class StartWorkService {
  private readonly logger = new Logger(StartWorkService.name);

  constructor(
    @InjectRepository(WorkItem)
    private readonly items: Repository<WorkItem>,
    @InjectRepository(WorkItemBranch)
    private readonly branches: Repository<WorkItemBranch>,
    @InjectRepository(WorkItemEvent)
    private readonly events: Repository<WorkItemEvent>,
    private readonly repositories: RepositoriesService,
    private readonly github: GithubAppService,
  ) {}

  /**
   * Ce que l'écran demande avant d'afficher le bouton.
   *
   * Rend toujours une réponse — jamais d'exception. Un ticket non éligible
   * n'est pas une erreur, c'est un ticket sur lequel on ne démarre pas de
   * travail technique.
   */
  async readiness(workItemId: number): Promise<StartWorkReadiness> {
    const item = await this.findItem(workItemId);
    const existing = await this.branches.find({
      where: { workItemId },
      order: { createdAt: 'DESC' },
    });

    const blocked = (blocker: StartWorkBlocker, reason: string): StartWorkReadiness => ({
      ready: false,
      blocker,
      reason,
      repositories: [],
      branchName: null,
      existing,
    });

    if (!TECHNICAL_TYPES.includes(item.type)) {
      return blocked(
        'not-technical',
        `Un ticket de type « ${item.type} » ne démarre pas de travail technique.`,
      );
    }
    if (item.status === 'resolved' || item.status === 'closed') {
      return blocked('closed', 'Ce ticket est terminé.');
    }
    if (existing.some((b) => b.state === 'open')) {
      return blocked(
        'already-started',
        `Ce ticket a déjà une branche : ${existing.find((b) => b.state === 'open')!.name}.`,
      );
    }
    if (!item.reference) {
      return blocked(
        'no-reference',
        "Ce ticket n'a pas de clé stable — sans elle, la branche ne pourrait pas le désigner.",
      );
    }
    /**
     * Un projet, ou à défaut un domaine. Les cent-six items du référentiel
     * v1.3 arrivent classés par domaine et sans projet — exiger un projet les
     * bloquerait tous, et ce sont ceux sur lesquels on veut travailler.
     */
    if (!item.projectId && !item.domainId) {
      return blocked(
        'no-project',
        "Ce ticket n'a ni projet ni domaine — rattachez-le pour choisir un dépôt.",
      );
    }

    const repositories = await this.repositories.allowedForWorkItem({
      projectId: item.projectId,
      domainId: item.domainId,
    });
    if (repositories.length === 0) {
      return blocked(
        'no-repository',
        item.projectId
          ? "Aucun dépôt n'est autorisé pour ce projet — rattachez-en un depuis « Dépôts de code »."
          : "Aucun dépôt n'est classé dans le domaine de ce ticket — classez-en un depuis « Dépôts de code ».",
      );
    }

    return {
      ready: true,
      repositories,
      branchName: branchNameFor({ type: item.type, reference: item.reference, title: item.title }),
      existing,
    };
  }

  /**
   * Crée la branche et met le ticket en cours.
   *
   * L'ordre compte : on écrit dans GitHub d'abord, on met HQ à jour ensuite.
   * L'inverse laisserait, en cas d'échec réseau, un ticket « en cours » sans
   * branche — le référentiel l'interdit explicitement : « les erreurs de
   * création n'entraînent pas de changement incohérent de statut ».
   */
  async startWork(
    workItemId: number,
    options: { repositoryId?: string; baseBranch?: string; prefix?: BranchPrefix },
    actor: string,
  ): Promise<StartWorkResult> {
    const readiness = await this.readiness(workItemId);
    if (!readiness.ready) {
      // `already-started` est un conflit — l'appelant a un état périmé ; le
      // reste est une demande qui n'a pas de sens pour ce ticket.
      throw readiness.blocker === 'already-started'
        ? new ConflictException(readiness.reason)
        : new BadRequestException(readiness.reason);
    }

    const item = await this.findItem(workItemId);
    const repository = this.pickRepository(readiness.repositories, options.repositoryId);
    const baseBranch = options.baseBranch ?? repository.defaultBranch;
    const name = branchNameFor({
      type: item.type,
      reference: item.reference!,
      title: item.title,
      prefix: options.prefix,
    });

    const baseSha = await this.github.branchSha(repository.owner, repository.name, baseBranch);
    const { created } = await this.github.createBranch(
      repository.owner,
      repository.name,
      name,
      baseSha,
    );

    if (!created) {
      this.logger.log(`Branche ${name} déjà présente sur ${repository.owner}/${repository.name} — reliée.`);
    }

    const now = new Date();
    const branch = await this.branches.save(
      this.branches.create({
        workItemId,
        repositoryId: repository.id,
        name,
        baseBranch,
        baseSha,
        state: 'open',
        createdBy: actor,
        createdByHq: created,
        htmlUrl: `https://github.com/${repository.owner}/${repository.name}/tree/${name}`,
        createdAt: now,
        updatedAt: now,
      }),
    );

    /**
     * Le statut ne recule jamais. Un ticket déjà en revue dont on ouvre une
     * seconde branche ne doit pas retomber en cours — le référentiel le dit
     * pour les gates, et la raison vaut ici : une action ne doit pas défaire
     * un état que quelqu'un a fait avancer.
     */
    if (item.status === 'todo' || item.status === 'triage' || item.status === 'blocked') {
      item.status = 'in_progress';
      item.updatedAt = now;
      await this.items.save(item);
    }

    await this.events.save(
      this.events.create({
        workItemId,
        actor,
        action: 'branch_created',
        meta: {
          branch: name,
          repository: `${repository.owner}/${repository.name}`,
          baseBranch,
          baseSha,
          createdByHq: created,
        },
        createdAt: now,
      }),
    );

    return { branch, created, workItem: item };
  }

  /** Les branches d'un ticket, pour son tiroir. */
  async branchesOf(workItemId: number): Promise<WorkItemBranch[]> {
    return this.branches.find({
      where: { workItemId },
      relations: ['repository'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Un dépôt explicite doit faire partie des autorisés — sinon la règle
   * « seuls les repositories autorisés sont proposés » se contournerait en
   * passant l'identifiant à la main.
   */
  private pickRepository(allowed: CodeRepository[], requested?: string): CodeRepository {
    if (!requested) {
      if (allowed.length > 1) {
        throw new BadRequestException(
          `Ce projet a ${allowed.length} dépôts autorisés — précisez lequel.`,
        );
      }
      return allowed[0];
    }
    const found = allowed.find((r) => r.id === requested);
    if (!found) {
      throw new BadRequestException("Ce dépôt n'est pas autorisé pour le projet de ce ticket.");
    }
    return found;
  }

  private async findItem(id: number): Promise<WorkItem> {
    const item = await this.items.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Ticket ${id} introuvable`);
    return item;
  }
}
