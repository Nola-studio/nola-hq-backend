import { IsIn, IsOptional, IsString } from 'class-validator';

const PRIORITIES = ['P1', 'P2', 'P3'] as const;
const STATUSES = ['open', 'pending', 'closed', 'resolved'] as const;
const CATEGORIES = [
  'technical',
  'billing',
  'account',
  'feature',
  'other',
] as const;

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
  @IsOptional() @IsString() sla?: string;
  /** What the request is about — drives HQ triage/filtering. */
  @IsOptional() @IsIn(CATEGORIES as unknown as string[])
  category?: (typeof CATEGORIES)[number];
  /** Where the ticket came from, e.g. 'kelasi-owner-app'. */
  @IsOptional() @IsString() source?: string;
  /** BusinessUnit code, e.g. 'khi-lab' — not a UUID. Defaults to 'khi-lab' when omitted. */
  @IsOptional() @IsString() businessUnitCode?: string;
}

export class AddReplyDto {
  @IsString() from!: string;
  @IsString() text!: string;
  @IsOptional() @IsString() t?: string;
}

export class UpdateTicketStatusDto {
  @IsIn(STATUSES as unknown as string[])
  status!: (typeof STATUSES)[number];
}

export class AssignTicketDto {
  @IsString() assignee!: string;
}
