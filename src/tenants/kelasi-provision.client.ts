import { Injectable, Logger, ServiceUnavailableException, ConflictException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface KelasiProvisionInput {
  schoolName: string;
  countryCode: string;
  city?: string;
  address?: string;
  planSlug: 'free' | 'starter' | 'growth' | 'scale';
  owner: {
    firstName: string;
    lastName: string;
    email: string;
    whatsappPhone?: string;
    mobileMoneyPhone?: string;
  };
}

export interface KelasiProvisionResult {
  tenantId: string;
  schoolId: string | null;
  kcUserId: string;
  organizationId?: string;
  personId?: string;
  invitationSentAt: string;
  schoolStatus: 'active' | 'pending_payment';
}

/**
 * HTTP client for kelasi-gateway's HQ-driven provisioning endpoint.
 *
 * The Studio operator runs the Onboarding wizard → `TenantsService.create`
 * calls this client → kelasi-gateway orchestrates the full chain
 * (Keycloak user, IAM, billing, svc-admin, Kriver, "set password"
 * email via Resend).
 *
 * Auth: shared secret in `Authorization: Bearer <HQ_PROVISION_SECRET>`
 * (env var on both sides). Timing-safe compare on the kelasi side.
 *
 * Errors are mapped to HQ-friendly exceptions so the wizard can show a
 * targeted message: 409 email_taken, 400 validation, 502/5xx as
 * service unavailable.
 */
@Injectable()
export class KelasiProvisionClient {
  private readonly logger = new Logger(KelasiProvisionClient.name);

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    const url = this.config.get<string>('KELASI_GATEWAY_URL');
    if (!url) throw new ServiceUnavailableException('KELASI_GATEWAY_URL not configured');
    return url.replace(/\/$/, '');
  }

  private get secret(): string {
    const s = this.config.get<string>('HQ_PROVISION_SECRET');
    if (!s) throw new ServiceUnavailableException('HQ_PROVISION_SECRET not configured');
    return s;
  }

  async provision(input: KelasiProvisionInput): Promise<KelasiProvisionResult> {
    const url = `${this.baseUrl}/api/admin/hq-provision`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secret}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(input),
      });
    } catch (err) {
      this.logger.error(`POST ${url} network error: ${err instanceof Error ? err.message : err}`);
      throw new ServiceUnavailableException('kelasi_gateway_unreachable');
    }

    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    if (res.ok) {
      this.logger.log(`Provisioned via kelasi-gateway: status=${res.status}`);
      return body as KelasiProvisionResult;
    }

    const message = this.extractMessage(body) ?? `kelasi_gateway_${res.status}`;
    this.logger.warn(`POST ${url} → ${res.status} ${message}`);
    if (res.status === 409) throw new ConflictException(message);
    if (res.status === 400) throw new BadRequestException(message);
    if (res.status === 401) throw new ServiceUnavailableException('hq_provision_unauthorized');
    throw new ServiceUnavailableException(`kelasi_provision_failed: ${message}`);
  }

  private extractMessage(body: unknown): string | null {
    if (!body || typeof body !== 'object') return null;
    const m = (body as Record<string, unknown>).message;
    if (typeof m === 'string') return m;
    if (m && typeof m === 'object') {
      const inner = (m as Record<string, unknown>).message;
      if (typeof inner === 'string') return inner;
    }
    return null;
  }
}
