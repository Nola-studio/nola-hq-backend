import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IamClientService } from './iam-client.service';
import { IamError } from './iam.types';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';

/**
 * Admin endpoints exposing nola-iam state to the HQ console. Every call
 * fan-outs to `nola.iam.commands.*` via NATS — there is no local cache,
 * keeping the read path simple at the cost of a NATS round-trip per request.
 *
 * Mounted under `/api/v1/iam/*` (the `setGlobalPrefix('api/v1')` in main.ts
 * adds the version segment).
 */
@ApiBearerAuth()
@ApiTags('iam')
@Controller('iam')
@HqRoles(HqRole.Viewer)
export class IamController {
  constructor(private readonly iam: IamClientService) {}

  // ─── orgs ────────────────────────────────────────────────────

  @Get('orgs')
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  async listOrgs(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('status') status?: string,
  ) {
    return this.iam.listAllOrgs({
      limit: parseIntOrUndef(limit),
      offset: parseIntOrUndef(offset),
      status,
    });
  }

  @Get('orgs/:id')
  async findOrg(@Param('id') id: string) {
    try {
      return await this.iam.findOrgById(id);
    } catch (err) {
      if (err instanceof IamError && err.code === 'not_found') {
        throw new NotFoundException('organization_not_found');
      }
      throw err;
    }
  }

  @Get('orgs/:id/memberships')
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  async listOrgMemberships(
    @Param('id') id: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.iam.listMembershipsForOrg(id, {
      includeInactive: includeInactive === 'true',
      includePerson: true,
    });
  }

  @Post('orgs/:id/suspend')
  @HqRoles(HqRole.Owner)
  async suspendOrg(@Param('id') id: string, @Query('reason') reason?: string) {
    if (!reason) {
      throw new BadRequestException('reason is required');
    }
    return this.iam.suspendOrg(id, reason);
  }

  @Post('orgs/:id/reactivate')
  @HqRoles(HqRole.Owner)
  async reactivateOrg(@Param('id') id: string) {
    return this.iam.reactivateOrg(id);
  }

  // ─── persons ─────────────────────────────────────────────────

  @Get('persons')
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'q', required: false, type: String })
  async listPersons(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    return this.iam.listAllPersons({
      limit: parseIntOrUndef(limit),
      offset: parseIntOrUndef(offset),
      status,
      search: q,
    });
  }

  @Get('persons/:id')
  async findPerson(@Param('id') id: string) {
    try {
      return await this.iam.findPersonById(id);
    } catch (err) {
      if (err instanceof IamError && err.code === 'not_found') {
        throw new NotFoundException('person_not_found');
      }
      throw err;
    }
  }

  @Get('persons/:id/memberships')
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  async listPersonMemberships(
    @Param('id') id: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.iam.listMembershipsForPerson(id, includeInactive === 'true');
  }

  // ─── memberships ─────────────────────────────────────────────

  @Get('memberships')
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'platformRole', required: false, type: String })
  @ApiQuery({ name: 'organizationId', required: false, type: String })
  @ApiQuery({ name: 'personId', required: false, type: String })
  async listMemberships(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('status') status?: string,
    @Query('platformRole') platformRole?: string,
    @Query('organizationId') organizationId?: string,
    @Query('personId') personId?: string,
  ) {
    return this.iam.listAllMemberships({
      limit: parseIntOrUndef(limit),
      offset: parseIntOrUndef(offset),
      status,
      platformRole,
      organizationId,
      personId,
      includePerson: true,
    });
  }
}

function parseIntOrUndef(v: string | undefined): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}
