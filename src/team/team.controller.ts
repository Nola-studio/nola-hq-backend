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
   * (profil affichable). Pour activer le login il faudra encore créer
   * l'utilisateur dans Keycloak realm `nola-hq` — soit côté nola-auth
   * `POST /users/nola-hq`, soit manuellement.
   */
  @Post()
  invite(@Body() dto: InviteTeamMemberDto) {
    return this.svc.invite(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTeamMemberDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
  }
}
