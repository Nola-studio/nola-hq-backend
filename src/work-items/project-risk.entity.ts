import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { RoadmapInitiative } from '../roadmap/roadmap-initiative.entity';

export const PROJECT_RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type ProjectRiskLevel = (typeof PROJECT_RISK_LEVELS)[number];
export const PROJECT_RISK_STATUSES = ['open', 'mitigated', 'closed'] as const;
export type ProjectRiskStatus = (typeof PROJECT_RISK_STATUSES)[number];

@Entity('project_risks')
export class ProjectRisk {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'uuid', name: 'project_id' })
  @Index()
  projectId!: string;

  @ManyToOne(() => RoadmapInitiative, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project?: RoadmapInitiative;

  @Column({ type: 'varchar', length: 200 }) title!: string;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({ type: 'varchar', default: 'medium' }) level!: ProjectRiskLevel;
  @Column({ type: 'varchar', default: 'open' }) @Index() status!: ProjectRiskStatus;
  @Column({ type: 'varchar', length: 160, nullable: true }) owner!: string | null;
  @Column({ type: 'text', nullable: true }) mitigation!: string | null;
  @Column({ name: 'created_at' }) createdAt!: Date;
  @Column({ name: 'updated_at' }) updatedAt!: Date;

  /** Functional domain and capability (§4A) — nullable until classified. */
  @Column({ type: 'uuid', name: 'domain_id', nullable: true }) @Index() domainId!: string | null;
  @Column({ type: 'uuid', name: 'capability_id', nullable: true }) capabilityId!: string | null;
}
