import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TeamService } from './team.service';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto';
import { InviteTeamMemberDto } from './dto/invite-team-member.dto';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';
import { CurrentUser, type AuthenticatedUser } from '../common/auth/current-user.decorator';

function actor(user?: AuthenticatedUser): string {
  return user?.email ?? user?.sub ?? 'unknown';
}

@ApiBearerAuth()
@ApiTags('team')
@Controller('team')
export class TeamController {
  constructor(private readonly svc: TeamService) {}

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  /**
   * Invite un nouveau membre de l'équipe HQ. Crée la row `team_members`
   * (profil affichable) ET provisionne automatiquement le compte Keycloak
   * (realm `nola-hq`) : compte activé, mot de passe temporaire (à changer à la
   * 1ʳᵉ connexion) et rôle realm `hq:*` selon `hqAccess`. La réponse porte
   * `keycloak.temporaryPassword` (une seule fois) à communiquer à l'invité.
   * Si Keycloak admin n'est pas configuré, la row est créée quand même et
   * `keycloak.reason` l'indique (activation manuelle).
   *
   * Owner-only: managing who has console access is the most privileged
   * action — it controls the admin surface itself.
   */
  @Post()
  @HqRoles(HqRole.Owner)
  invite(@Body() dto: InviteTeamMemberDto) {
    return this.svc.invite(dto);
  }

  @Patch(':id')
  @HqRoles(HqRole.Owner)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTeamMemberDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.svc.update(id, dto, actor(user));
  }

  @Delete(':id')
  @HqRoles(HqRole.Owner)
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() user?: AuthenticatedUser) {
    await this.svc.remove(id, actor(user));
  }

  /**
   * Backfills `hqAccess` for every member that predates the column, by
   * reading their current Keycloak realm roles. Idempotent — safe to call
   * repeatedly (a no-op once every member is resolved). Never guesses: a
   * member with no matching Keycloak account or no `hq:*` role there is
   * reported `unresolved`, not defaulted.
   */
  @Post('backfill-hq-access')
  @HqRoles(HqRole.Owner)
  backfillHqAccess() {
    return this.svc.backfillHqAccessFromKeycloak();
  }

  /**
   * Creates a `team_members` row for any Keycloak user holding an `hq:*`
   * realm role (real, enforced access) that has no row here at all — the
   * gap `backfill-hq-access` doesn't cover, since that one only repairs
   * existing rows. Manual repair action, never run automatically.
   */
  @Post('backfill-missing-members')
  @HqRoles(HqRole.Owner)
  backfillMissingMembers() {
    return this.svc.backfillMissingMembers();
  }
}
