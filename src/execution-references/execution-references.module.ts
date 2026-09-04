import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExecutionReference, ExecutionReferenceVersion } from './execution-reference.entity';
import { ExecutionReferencesService } from './execution-references.service';
import { ExecutionReferencesController } from './execution-references.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ExecutionReference, ExecutionReferenceVersion])],
  controllers: [ExecutionReferencesController],
  providers: [ExecutionReferencesService],
  exports: [ExecutionReferencesService],
})
export class ExecutionReferencesModule {}
