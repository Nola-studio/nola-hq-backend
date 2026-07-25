import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RoadmapInitiative } from './roadmap-initiative.entity';

/**
 * Bottom level of the roadmap: an **execution checkpoint** inside an
 * initiative. Milestones are the only real source of truth for an
 * initiative's progress — as soon as one exists, the initiative's stored
 * `progress` is ignored in favour of `done / total`
 * (cf. `deriveInitiativeProgress`).
 *
 * Cascade-deleted with its initiative: a checkpoint has no meaning on its own.
 */
@Entity('roadmap_milestones')
export class RoadmapMilestone {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'initiative_id' })
  @Index()
  initiativeId!: string;

  @ManyToOne(() => RoadmapInitiative, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'initiative_id' })
  initiative?: RoadmapInitiative;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  /** `YYYY-MM-DD` — TypeORM hands `date` columns back as strings. */
  @Column({ type: 'date', name: 'due_date', nullable: true })
  dueDate!: string | null;

  @Column({ type: 'boolean', default: false })
  done!: boolean;

  /** Rank inside the parent initiative's checklist (0-based). */
  @Column({ type: 'integer', default: 0 })
  position!: number;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}
