import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TeamMember } from './team-member.entity';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';
import { DirectoryModule } from '../directory/directory.module';

@Module({
  // DirectoryModule provides KeycloakAdminService (auto-provisioning of the
  // Keycloak account on invite).
  imports: [TypeOrmModule.forFeature([TeamMember]), DirectoryModule],
  controllers: [TeamController],
  providers: [TeamService],
  exports: [TeamService],
})
export class TeamModule {}
