import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantsService } from '../tenants/tenants.service';
import { IamClientService } from '../iam/iam-client.service';
import { KeycloakAdminService } from '../directory/keycloak-admin.service';
import { realmForApp } from '../directory/realms.config';
import { HandoffStore, type Handoff } from './handoff.store';

export interface StartAssistInput {
  tenantId: string;
  app: string;
  mode: 'read' | 'write';
  reason: string;
  /** Optional explicit target; otherwise the tenant's owner is used. */
  targetEmail?: string;
  actor: string;
  actorName?: string;
}

@Injectable()
export class AssistService {
  private readonly logger = new Logger(AssistService.name);

  constructor(
    private readonly tenants: TenantsService,
    private readonly iam: IamClientService,
    private readonly kc: KeycloakAdminService,
    private readonly handoffs: HandoffStore,
    private readonly config: ConfigService,
  ) {}

  /**
   * Orchestrate assisted access: resolve the target Keycloak user for the
   * tenant, ask nola-auth to mint an impersonated token, stash it behind a
   * one-time code, and return the app deeplink the operator opens.
   */
  async start(
    input: StartAssistInput,
  ): Promise<{ url: string; expiresAt: number }> {
    const realm = realmForApp(input.app)?.id;
    if (!realm) {
      throw new BadRequestException(`unknown_app_realm: ${input.app}`);
    }

    // 1. Resolve the target user's email (explicit, else the tenant owner via IAM).
    const email = (input.targetEmail ?? (await this.resolveOwnerEmail(input.tenantId)))?.trim();
    if (!email) {
      throw new NotFoundException('target_user_unresolved');
    }

    // 2. Resolve the Keycloak user id in the app realm (exact email match).
    const candidates = await this.kc.listUsers(realm, { search: email, max: 5 });
    const target = candidates.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    );
    if (!target?.id) {
      throw new NotFoundException(`keycloak_user_not_found: ${email}@${realm}`);
    }

    // 3. Mint the impersonated token via nola-auth.
    const tokens = await this.iam.impersonate({
      realm,
      targetUserId: target.id,
      mode: input.mode,
      reason: input.reason,
      actor: input.actor,
      actorName: input.actorName,
    });
    if (!tokens.refreshToken) {
      throw new BadRequestException('impersonation_no_refresh_token');
    }

    // 4. Stash behind a one-time code; the app redeems it back-channel.
    const { code, expiresAt } = this.handoffs.create({
      refreshToken: tokens.refreshToken,
      realm,
      app: input.app,
      mode: input.mode,
      by: input.actor,
      byName: input.actorName,
      reason: input.reason,
      targetUserId: target.id,
    });

    this.logger.log(
      `Assisted access started: ${input.actor} → ${email} (${input.app}, ${input.mode})`,
    );
    return { url: `${this.appBaseUrl(input.app)}/auth/assume?code=${code}`, expiresAt };
  }

  /** Back-channel redemption (called by the target app's gateway). */
  redeem(code: string): Handoff {
    const entry = this.handoffs.redeem(code);
    if (!entry) throw new NotFoundException('handoff_invalid_or_expired');
    return entry;
  }

  /** Shared secret the app must present to redeem a handoff. */
  redeemSecret(): string | undefined {
    return this.config.get<string>('ASSIST_REDEEM_SECRET');
  }

  private async resolveOwnerEmail(tenantId: string): Promise<string | null> {
    const tenant = await this.tenants.findOne(tenantId);
    if (!tenant.organizationId) return null;
    const memberships = await this.iam.listMembershipsForOrg(tenant.organizationId, {
      includePerson: true,
    });
    // Prefer an explicit owner/admin role, else the first member with an email.
    const owner =
      memberships.find(
        (m) => /owner|admin/i.test(m.platformRole ?? '') && m.person?.primaryEmail,
      ) ?? memberships.find((m) => m.person?.primaryEmail);
    return owner?.person?.primaryEmail ?? null;
  }

  private appBaseUrl(app: string): string {
    const fromEnv = this.config.get<string>(`${app.toUpperCase()}_BASE_URL`);
    if (fromEnv) return fromEnv.replace(/\/$/, '');
    throw new BadRequestException(`missing_base_url_for_app: ${app}`);
  }
}
