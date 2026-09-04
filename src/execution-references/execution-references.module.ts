import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExecutionReference, ExecutionReferenceVersion } from './execution-reference.entity';
import { ExecutionManifest, ExecutionManifestItem } from './execution-manifest.entity';
import { ExecutionReferencesService } from './execution-references.service';
import { ExecutionImportService } from './execution-import.service';
import { ExecutionReferencesController } from './execution-references.controller';
import { Capability, Domain } from '../domains/domain.entity';
import { WorkItem } from '../work-items/work-item.entity';

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
    ]),
  ],
  controllers: [ExecutionReferencesController],
  providers: [ExecutionReferencesService, ExecutionImportService],
  exports: [ExecutionReferencesService, ExecutionImportService],
})
export class ExecutionReferencesModule {}
