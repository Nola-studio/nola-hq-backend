import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessUnit } from './business-unit.entity';
import { HqRole, hasHqRole } from '../common/auth/hq-role.enum';

/** Default business unit for creates that don't specify one explicitly. */
export const DEFAULT_BUSINESS_UNIT_CODE = 'khi-lab';

/**
 * Resolves a `BusinessUnit.code` to its `id`. Only three rows exist today,
 * so this caches the whole table rather than anything fancier — correctness
 * over cleverness. A miss reloads once (covers a unit added after boot)
 * before concluding the code is genuinely unknown.
 *
 * Scope Resolution Rules:
 * - `hq:owner`: Resolves to ALL business unit IDs in the database (including
 *   inactive ones, so historical tickets/invoices remain fully visible to founders).
 * - Non-owner (`hq:operator`, `hq:viewer`): Resolves strictly to the business
 *   units declared in their `hq:bu:<code>` roles (e.g. `hq:bu:khi-lab`, `hq:bu:vantelis-it`).
 * - Unscoped non-owner: An authenticated non-owner with NO `hq:bu:*` roles resolves
 *   to an EMPTY LIST (`[]`) and sees zero records (fail-closed).
 *
 * NOTE: Provisioning a non-owner teammate now requires TWO grants:
 *   1. Base role: `hq:viewer` or `hq:operator`
 *   2. Brand scope: at least one `hq:bu:<code>` role (e.g. `hq:bu:khi-lab`)
 *   Without the brand role, they will log in successfully but see an empty HQ.
 */
@Injectable()
export class BusinessUnitResolverService {
  private readonly logger = new Logger(BusinessUnitResolverService.name);
  private cache: Map<string, string> | null = null;

  constructor(
    @InjectRepository(BusinessUnit)
    private readonly repo: Repository<BusinessUnit>,
  ) {}

  /** Throws `BadRequestException` listing valid codes — never a silent fallback. */
  async resolve(code: string): Promise<string> {
    let map = await this.load();
    if (!map.has(code)) {
      this.cache = null;
      map = await this.load();
    }
    const id = map.get(code);
    if (!id) {
      const validCodes = [...map.keys()].sort().join(', ');
      throw new BadRequestException(`Unknown business unit code '${code}'. Valid codes: ${validCodes}`);
    }
    return id;
  }

  /**
   * Returns all business unit IDs (UUIDs) across the entire database,
   * regardless of `isActive` flag. Used for owner access.
   */
  async resolveAllIds(): Promise<string[]> {
    const map = await this.load();
    return [...map.values()];
  }

  /**
   * Resolves the list of business unit UUIDs accessible to the given user roles.
   * - `hq:owner` -> returns ALL business unit UUIDs.
   * - Non-owner -> parses `hq:bu:<code>` roles and maps each valid code to UUID.
   * - Unscoped non-owner -> returns `[]` (empty list, fail-closed).
   */
  async resolveAllowedUnits(roles: string[] = []): Promise<string[]> {
    if (hasHqRole(roles, HqRole.Owner)) {
      return this.resolveAllIds();
    }

    const buCodes = roles
      .filter((r) => r.startsWith('hq:bu:'))
      .map((r) => r.slice('hq:bu:'.length));

    if (buCodes.length === 0) {
      return [];
    }

    let map = await this.load();
    const ids: string[] = [];

    for (const code of buCodes) {
      let id = map.get(code);
      if (!id) {
        // Reload once in case a new BU was added since cache creation
        this.cache = null;
        map = await this.load();
        id = map.get(code);
      }
      if (id) {
        ids.push(id);
      } else {
        this.logger.warn(`User holds unknown brand role 'hq:bu:${code}' — ignoring`);
      }
    }

    return [...new Set(ids)];
  }

  private async load(): Promise<Map<string, string>> {
    if (this.cache) return this.cache;
    const rows = await this.repo.find();
    this.cache = new Map(rows.map((r) => [r.code, r.id]));
    return this.cache;
  }
}
