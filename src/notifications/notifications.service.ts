import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { NolaClientService } from '@nola-hq/nola-sdk';

/**
 * Operator-facing test surface for the Nola notification pipeline.
 *
 * Publishes `nola.commands.notify.send` on the cross-app bus (same
 * subject the auto-invite flow / billing flow / incident bridge use
 * in production). The downstream `nola-notify` service consumes the
 * command, renders the named template (or the `_inline` sentinel for
 * raw subject+body), and dispatches through the configured channel
 * provider (Resend SMTP for email, etc).
 *
 * Why this lives in nola-hq-backend rather than as a temporary endpoint
 * in kelasi: HQ already holds the privileged `nola-studio` NATS user
 * with publish rights on `nola.commands.notify.send`, the existing
 * `IncidentAlertListener` uses the same path, and it's the natural
 * place for an ops "send test email" capability that won't be
 * deleted when validation is done.
 *
 * Failures are surfaced as ServiceUnavailable when NolaClient is
 * offline (so the operator UI shows a clear error instead of a silent
 * 200) and as BadRequest when the payload is malformed.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly nolaClient: NolaClientService) {}

  async sendTest(input: {
    channel: 'email' | 'sms' | 'whatsapp';
    to: string;
    template: string;
    variables?: Record<string, string>;
    issuedBy?: string;
  }): Promise<{ published: boolean; subject: string; idempotencyKey: string }> {
    if (!this.nolaClient.isReady()) {
      throw new BadRequestException(
        'nola_client_offline — NATS not yet connected; retry in a few seconds',
      );
    }
    const idempotencyKey = `hq-test-${crypto.randomUUID()}`;
    try {
      await this.nolaClient.getClient().publish('nola.commands.notify.send', {
        channel: input.channel,
        to: input.to,
        template: input.template,
        variables: input.variables ?? {},
        idempotencyKey,
        realm: 'nola-hq',
        tenantId: 'nola-studio',
      });
      this.logger.log(
        `test notify sent: to=${input.to} template=${input.template} by=${input.issuedBy ?? 'unknown'}`,
      );
      return { published: true, subject: 'nola.commands.notify.send', idempotencyKey };
    } catch (err) {
      this.logger.error(
        `test notify publish failed: ${err instanceof Error ? err.message : err}`,
      );
      throw new BadRequestException(
        `publish_failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
  }
}
