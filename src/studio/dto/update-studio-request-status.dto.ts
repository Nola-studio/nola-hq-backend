import { IsIn } from 'class-validator';
import { STUDIO_REQUEST_STATUSES, type StudioRequestStatus } from '../studio-request.entity';

/** POST /studio/requests/:id/status — the only way `status` ever changes. Gated `hq:operator`. */
export class UpdateStudioRequestStatusDto {
  @IsIn(STUDIO_REQUEST_STATUSES as unknown as string[]) status!: StudioRequestStatus;
}
