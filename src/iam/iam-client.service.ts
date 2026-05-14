import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { NolaClientService } from '@nola-hq/nola-sdk';
import {
  IamError,
  type IamMembershipResponse,
  type IamOrgResponse,
  type IamPage,
  type IamPersonAdminRow,
  type IamPersonResponse,
  type IamReply,
} from './iam.types';

const DEFAULT_TIMEOUT_MS = 6_000;

/**
 * IamClientService — meta-platform-scoped wrapper around `nola.iam.commands.*`.
 *
 * nola-hq is the only caller with admin reach: it queries every org, every
 * person and every membership across all realms (no `realm` / `tenant` filter
 * is applied here — the NATS publish ACL on `nola.iam.commands.>` is the
 * authorization boundary).
 *
 * The reply envelope from nola-iam is `{ ok, data | error }`; this service
 * unwraps it and throws `IamError` on remote `ok: false` so consumers can
 * `try/catch` instead of inspecting NATS shapes.
 */
@Injectable()
export class IamClientService {
  private readonly logger = new Logger(IamClientService.name);

  constructor(private readonly nolaClient: NolaClientService) {}

  // ─── orgs ────────────────────────────────────────────────────

  listAllOrgs(opts: {
    limit?: number;
    offset?: number;
    status?: string;
  } = {}): Promise<IamPage<IamOrgResponse>> {
    return this.request<IamPage<IamOrgResponse>>(
      'nola.iam.commands.orgs.list_all',
      opts,
    );
  }

  findOrgById(id: string): Promise<IamOrgResponse> {
    return this.request<IamOrgResponse>('nola.iam.commands.orgs.find_by_id', { id });
  }

  suspendOrg(id: string, reason: string): Promise<IamOrgResponse> {
    return this.request<IamOrgResponse>('nola.iam.commands.orgs.suspend', {
      id,
      reason,
    });
  }

  reactivateOrg(id: string): Promise<IamOrgResponse> {
    return this.request<IamOrgResponse>('nola.iam.commands.orgs.reactivate', { id });
  }

  // ─── persons ─────────────────────────────────────────────────

  listAllPersons(opts: {
    limit?: number;
    offset?: number;
    status?: string;
    search?: string;
  } = {}): Promise<IamPage<IamPersonAdminRow>> {
    return this.request<IamPage<IamPersonAdminRow>>(
      'nola.iam.commands.persons.list_all',
      opts,
    );
  }

  findPersonById(id: string): Promise<IamPersonResponse> {
    return this.request<IamPersonResponse>(
      'nola.iam.commands.persons.find_by_id',
      { id },
    );
  }

  // ─── memberships ─────────────────────────────────────────────

  listAllMemberships(opts: {
    limit?: number;
    offset?: number;
    status?: string;
    platformRole?: string;
    organizationId?: string;
    personId?: string;
    includePerson?: boolean;
  } = {}): Promise<IamPage<IamMembershipResponse>> {
    return this.request<IamPage<IamMembershipResponse>>(
      'nola.iam.commands.memberships.list_all',
      opts,
    );
  }

  listMembershipsForOrg(
    organizationId: string,
    options: { includeInactive?: boolean; includePerson?: boolean } = {},
  ): Promise<IamMembershipResponse[]> {
    return this.request<IamMembershipResponse[]>(
      'nola.iam.commands.memberships.list_for_org',
      {
        organizationId,
        includeInactive: options.includeInactive ?? false,
        includePerson: options.includePerson ?? true,
      },
    );
  }

  listMembershipsForPerson(
    personId: string,
    includeInactive = false,
  ): Promise<IamMembershipResponse[]> {
    return this.request<IamMembershipResponse[]>(
      'nola.iam.commands.memberships.list_for_person',
      { personId, includeInactive },
    );
  }

  // ─── internals ───────────────────────────────────────────────

  private async request<T>(
    subject: string,
    payload: Record<string, unknown>,
  ): Promise<T> {
    if (!this.nolaClient.isReady()) {
      this.logger.warn(`${subject} skipped — NolaClient not ready`);
      throw new ServiceUnavailableException('iam_offline');
    }
    let reply: IamReply<T>;
    try {
      reply = await this.nolaClient.getClient().request<typeof payload, IamReply<T>>(
        subject,
        payload,
        DEFAULT_TIMEOUT_MS,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`${subject} NATS request failed: ${message}`);
      throw new ServiceUnavailableException('iam_unreachable');
    }
    if (!reply.ok) {
      throw new IamError(reply.error.code, reply.error.message, subject);
    }
    return reply.data;
  }
}
