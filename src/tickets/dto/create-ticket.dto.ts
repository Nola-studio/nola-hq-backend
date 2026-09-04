import { IsDateString, IsIn, IsInt, IsOptional, IsString } from 'class-validator';

const PRIORITIES = ['P1', 'P2', 'P3'] as const;
const STATUSES = ['open', 'pending', 'closed', 'resolved'] as const;
const CATEGORIES = [
  'technical',
  'billing',
  'account',
  'feature',
  'deployment',
  'other',
] as const;
const REPLY_VISIBILITIES = ['internal', 'client'] as const;
const PENDING_REASONS = ['client', 'vendor', 'internal'] as const;

export class CreateTicketDto {
  @IsString() tenant!: string;
  @IsString() subject!: string;
  @IsOptional() @IsString() title?: string;
  @IsString() body!: string;
  @IsString() contact!: string;
  @IsIn(PRIORITIES as unknown as string[])
  priority!: (typeof PRIORITIES)[number];
  @IsOptional() @IsIn(STATUSES as unknown as string[])
  status?: (typeof STATUSES)[number];
  @IsString() assignee!: string;
  /** What the request is about — drives HQ triage/filtering. */
  @IsOptional() @IsIn(CATEGORIES as unknown as string[])
  category?: (typeof CATEGORIES)[number];
  /** Where the ticket came from, e.g. 'kelasi-owner-app'. */
  @IsOptional() @IsString() source?: string;
  /** BusinessUnit code, e.g. 'khi-lab' — not a UUID. Defaults to 'khi-lab' when omitted. */
  @IsOptional() @IsString() businessUnitCode?: string;
  /** Producing app's own upstream due date (e.g. Vantelis IT's meta.dueAt) — display only, never HQ's SLA source of truth. */
  @IsOptional() @IsDateString() dueAt?: string;
  /** Optional linked internal studio work item (task/ticket). */
  @IsOptional() @IsInt() workItemId?: number | null;
}

export class AddReplyDto {
  @IsString() from!: string;
  @IsString() text!: string;
  @IsOptional() @IsString() t?: string;
  /** Absent means 'internal' — an operator opts IN to client-visible, never opts out. */
  @IsOptional() @IsIn(REPLY_VISIBILITIES as unknown as string[])
  visibility?: (typeof REPLY_VISIBILITIES)[number];
}

export class UpdateTicketStatusDto {
  @IsIn(STATUSES as unknown as string[])
  status!: (typeof STATUSES)[number];

  /** Only meaningful when `status === 'pending'`; ignored otherwise. Omitted/null means 'client'. */
  @IsOptional() @IsIn(PENDING_REASONS as unknown as string[])
  pendingReason?: (typeof PENDING_REASONS)[number];
}

export class AssignTicketDto {
  @IsString() assignee!: string;
}

export class UpdateTicketDto {
  @IsOptional()
  @IsIn(PRIORITIES as unknown as string[])
  priority?: (typeof PRIORITIES)[number];

  @IsOptional()
  @IsIn(CATEGORIES as unknown as string[])
  category?: (typeof CATEGORIES)[number] | null;

  @IsOptional()
  @IsInt()
  workItemId?: number | null;
}
