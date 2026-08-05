import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A team meeting: agenda + decisions (both freeform Markdown) and the
 * participants who attended. Tasks can optionally link back to the meeting
 * a decision was made in (`WorkItem.meetingId`).
 */
@Entity('studio_meetings')
export class StudioMeeting {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  /** Team members' emails (soft reference — `team_members.email`). */
  @Column({ type: 'simple-json', default: '[]' })
  participants!: string[];

  @Column({ type: 'text', nullable: true })
  agenda!: string | null;

  @Column({ type: 'text', nullable: true })
  decisions!: string | null;

  @Column({ name: 'created_at' })
  createdAt!: Date;
}
