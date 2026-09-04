import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoadmapInitiative } from '../roadmap/roadmap-initiative.entity';
import { GithubAppService } from './github-app.service';
import { RepositoriesController } from './repositories.controller';
import { RepositoriesService } from './repositories.service';
import { CodeRepository, RepositoryProject } from './repository.entity';

/**
 * L'intégration GitHub (D06.C03).
 *
 * Le lot 2.0 apporte le registre, le lot 2.1 l'authentification par GitHub
 * App et le rapprochement d'un dépôt avec ce que GitHub en dit. « Start
 * Work » et les webhooks viendront s'ajouter ici.
 */
@Module({
  imports: [TypeOrmModule.forFeature([CodeRepository, RepositoryProject, RoadmapInitiative])],
  controllers: [RepositoriesController],
  providers: [RepositoriesService, GithubAppService],
  exports: [RepositoriesService, GithubAppService],
})
export class GithubModule {}
