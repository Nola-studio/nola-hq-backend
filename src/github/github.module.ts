import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoadmapInitiative } from '../roadmap/roadmap-initiative.entity';
import { RepositoriesController } from './repositories.controller';
import { RepositoriesService } from './repositories.service';
import { CodeRepository, RepositoryProject } from './repository.entity';

/**
 * L'intégration GitHub (D06.C03).
 *
 * Le lot 2.0 n'apporte que le registre : aucun appel réseau, aucun secret.
 * L'authentification (GitHub App), la synchronisation et « Start Work »
 * viendront s'ajouter ici.
 */
@Module({
  imports: [TypeOrmModule.forFeature([CodeRepository, RepositoryProject, RoadmapInitiative])],
  controllers: [RepositoriesController],
  providers: [RepositoriesService],
  exports: [RepositoriesService],
})
export class GithubModule {}
