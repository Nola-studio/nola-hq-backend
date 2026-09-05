import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoadmapInitiative } from '../roadmap/roadmap-initiative.entity';
import { GithubAppService } from './github-app.service';
import { StartWorkService } from './start-work.service';
import { WorkItemBranch } from './work-item-branch.entity';
import { WorkItem } from '../work-items/work-item.entity';
import { WorkItemEvent } from '../work-items/work-item-event.entity';
import { GithubWebhookDelivery } from './github-webhook-delivery.entity';
import { GithubWebhooksController } from './github-webhooks.controller';
import { GithubWebhooksService } from './github-webhooks.service';
import { RepositoriesController } from './repositories.controller';
import { RepositoriesService } from './repositories.service';
import { CodeRepository, RepositoryProject } from './repository.entity';

/**
 * L'intégration GitHub (D06.C03).
 *
 * Le lot 2.0 apporte le registre, le lot 2.1 l'authentification par GitHub
 * App et le rapprochement d'un dépôt avec ce que GitHub en dit. « Start
 * Work » (lot 2.3) crée la branche depuis un ticket.
 */
@Module({
  imports: [TypeOrmModule.forFeature([
      CodeRepository,
      RepositoryProject,
      RoadmapInitiative,
      GithubWebhookDelivery,
      WorkItemBranch,
      WorkItem,
      WorkItemEvent,
    ])],
  controllers: [RepositoriesController, GithubWebhooksController],
  providers: [RepositoriesService, GithubAppService, GithubWebhooksService, StartWorkService],
  exports: [RepositoriesService, GithubAppService, GithubWebhooksService, StartWorkService],
})
export class GithubModule {}
