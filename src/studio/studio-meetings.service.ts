import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkItem } from '../work-items/work-item.entity';
import { WORK_ITEM_STATUS_TO_STUDIO_STATUS } from '../work-items/work-item-studio-mapping';
import { StudioMeeting } from './studio-meeting.entity';
import { StudioProjectsProxyService } from './studio-projects-proxy.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { CreateMeetingTaskDto } from './dto/create-meeting-task.dto';

/** A team meeting: agenda + decisions (Markdown), and the tasks decided in it. */
@Injectable()
export class StudioMeetingsService {
  constructor(
    @InjectRepository(StudioMeeting)
    private readonly meetings: Repository<StudioMeeting>,
    @InjectRepository(WorkItem)
    private readonly tasks: Repository<WorkItem>,
    private readonly proxy: StudioProjectsProxyService,
  ) {}

  async findAll(): Promise<StudioMeeting[]> {
    return this.meetings.find({ order: { date: 'DESC', createdAt: 'DESC' } });
  }

  /** One meeting with its linked tasks (identifier + status, for the drawer's chip list). */
  async findOne(id: string) {
    const meeting = await this.meetings.findOne({ where: { id } });
    if (!meeting) throw new NotFoundException(`Réunion ${id} introuvable`);
    const linked = await this.tasks.find({ where: { meetingId: id }, order: { createdAt: 'ASC' } });
    const tasks = linked.map((t) => ({
      id: String(t.id),
      identifier: t.reference,
      status: WORK_ITEM_STATUS_TO_STUDIO_STATUS[t.status],
    }));
    return { ...meeting, tasks };
  }

  async create(dto: CreateMeetingDto): Promise<StudioMeeting> {
    const meeting = this.meetings.create({
      date: dto.date,
      title: dto.title,
      participants: dto.participants ?? [],
      agenda: dto.agenda ?? null,
      decisions: dto.decisions ?? null,
      createdAt: new Date(),
    });
    return this.meetings.save(meeting);
  }

  async update(id: string, dto: UpdateMeetingDto): Promise<StudioMeeting> {
    const meeting = await this.meetings.findOne({ where: { id } });
    if (!meeting) throw new NotFoundException(`Réunion ${id} introuvable`);

    if (dto.date !== undefined) meeting.date = dto.date;
    if (dto.title !== undefined) meeting.title = dto.title;
    if (dto.participants !== undefined) meeting.participants = dto.participants;
    if (dto.agenda !== undefined) meeting.agenda = dto.agenda ?? null;
    if (dto.decisions !== undefined) meeting.decisions = dto.decisions ?? null;
    return this.meetings.save(meeting);
  }

  async remove(id: string): Promise<void> {
    const meeting = await this.meetings.findOne({ where: { id } });
    if (!meeting) throw new NotFoundException(`Réunion ${id} introuvable`);
    await this.meetings.remove(meeting);
  }

  /** Creates a task pre-linked to this meeting — "décision → tâche en un clic". */
  async createTask(meetingId: string, dto: CreateMeetingTaskDto, createdByEmail: string) {
    const meeting = await this.meetings.findOne({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException(`Réunion ${meetingId} introuvable`);
    return this.proxy.createTask({ ...dto, meetingId }, createdByEmail);
  }
}
