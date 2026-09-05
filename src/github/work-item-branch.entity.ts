import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { WorkItem } from '../work-items/work-item.entity';
import { CodeRepository } from './repository.entity';

export const BRANCH_STATES = ['open', 'merged', 'deleted'] as const;
export type BranchState = (typeof BRANCH_STATES)[number];

/**
 * Le lien entre un ticket et la branche qui le réalise (ENG-08).
 *
 * Sans cette table, la branche existe sur GitHub et HQ ignore à quoi elle se
 * rapporte. C'est elle qui répond à « où en est ce ticket, concrètement ? » et
 * à « pourquoi cette branche existe-t-elle ? ».
 *
 * Un ticket peut en avoir plusieurs — le référentiel le prévoit : « un work
 * item peut être lié à plusieurs repositories lorsque le travail est
 * réellement multi-composant ». D'où une table plutôt qu'une colonne sur
 * `work_items`.
 *
 * Rien n'est jamais supprimé ici. Une branche effacée sur GitHub passe à
 * `deleted` : « la suppression d'une branche ne supprime jamais son historique
 * dans Nolaa HQ ».
 */
@Entity('work_item_branches')
@Unique('UQ_work_item_branches_repo_name', ['repositoryId', 'name'])
export class WorkItemBranch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'integer', name: 'work_item_id' })
  @Index()
  workItemId!: number;

  @ManyToOne(() => WorkItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'work_item_id' })
  workItem?: WorkItem;

  @Column({ type: 'uuid', name: 'repository_id' })
  @Index()
  repositoryId!: string;

  /**
   * `RESTRICT` : retirer du registre un dépôt où du travail est en cours
   * effacerait le lien qui explique une branche. Il faut d'abord archiver.
   */
  @ManyToOne(() => CodeRepository, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'repository_id' })
  repository?: CodeRepository;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  /** La branche depuis laquelle celle-ci part — `main` la plupart du temps. */
  @Column({ type: 'varchar', length: 255, name: 'base_branch' })
  baseBranch!: string;

  /**
   * Le commit exact sur lequel la branche a été ouverte.
   *
   * `main` bouge ; ce SHA non. C'est lui qui permet de dire six mois plus tard
   * d'où ce travail est parti, quand `main` a mille commits d'avance.
   */
  @Column({ type: 'varchar', length: 40, name: 'base_sha', nullable: true })
  baseSha!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  @Index()
  state!: BranchState;

  /**
   * Qui a déclenché la création côté HQ.
   *
   * Distinct de l'auteur côté GitHub, qui est l'App : le référentiel demande
   * de « distinguer auteur, reviewer, approbateur et personne ayant réellement
   * livré », et confondre les deux rendrait toute contribution anonyme.
   */
  @Column({ type: 'varchar', length: 160, name: 'created_by' })
  createdBy!: string;

  /**
   * `true` quand HQ a créé la branche, `false` quand il n'a fait que la
   * reconnaître — une branche poussée depuis un terminal, retrouvée par sa
   * clé. La provenance ne se devine pas après coup.
   */
  @Column({ type: 'boolean', name: 'created_by_hq', default: true })
  createdByHq!: boolean;

  @Column({ type: 'varchar', length: 500, name: 'html_url', nullable: true })
  htmlUrl!: string | null;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}
