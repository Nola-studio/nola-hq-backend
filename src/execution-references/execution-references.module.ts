import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExecutionReference, ExecutionReferenceVersion } from './execution-reference.entity';
import { ExecutionManifest, ExecutionManifestItem } from './execution-manifest.entity';
import { ExecutionReferencesService } from './execution-references.service';
import { ExecutionImportService } from './execution-import.service';
import { ExecutionReferencesController } from './execution-references.controller';
import { Capability, Domain } from '../domains/domain.entity';
import { WorkItem } from '../work-items/work-item.entity';
import { RoadmapInitiative } from '../roadmap/roadmap-initiative.entity';
import { Release } from '../releases/release.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExecutionReference,
      ExecutionReferenceVersion,
      ExecutionManifest,
      ExecutionManifestItem,
      Domain,
      Capability,
      WorkItem,
      // Résout « Projet : NolaHQ » en tête d'un document contre le registre
      // des projets. Sans cette ligne, `ExecutionImportService` ne peut pas
      // être construit et l'application ne démarre pas.
      RoadmapInitiative,
      // Résout « Version cible : 1.4 » contre le registre (REL-00).
      Release,
    ]),
  ],
  controllers: [ExecutionReferencesController],
  providers: [ExecutionReferencesService, ExecutionImportService],
  exports: [ExecutionReferencesService, ExecutionImportService],
})
export class ExecutionReferencesModule {}
