import { Injectable } from '@nestjs/common';
import { NotifyClient } from '@nola-studio/sdk';
import type {
  NotificationRequest,
  NotificationResult,
} from '@nola-studio/sdk/notify';
import { NolaClientService } from '../nola-client.service';

@Injectable()
export class NolaNotifyService {
  private notify: NotifyClient | null = null;

  constructor(private readonly nolaClient: NolaClientService) {}

  async send(request: NotificationRequest): Promise<NotificationResult> {
    if (!request.template.startsWith('kelasi.')) {
      throw new Error(
        `template must be prefixed with "kelasi." — got "${request.template}"`,
      );
    }
    if (!this.notify) {
      this.notify = new NotifyClient(this.nolaClient.getClient());
    }
    return this.notify.send(request);
  }
}
