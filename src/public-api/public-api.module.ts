import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyKey } from './idempotency-key.entity';
import { IdempotencyService } from './idempotency.service';
import { IdempotencyPurgeScheduler } from './idempotency-purge.scheduler';
import { PublicExecutionReferencesController } from './public-execution-references.controller';
import { MachineClientGuard } from '../common/auth/machine-client.guard';
import { ExecutionReferencesModule } from '../execution-references/execution-references.module';

/**
 * La façade publique. Elle n'a aucun service métier à elle : tout est délégué
 * à `ExecutionReferencesModule`, pour qu'il n'existe jamais deux chemins
 * d'entrée qui pourraient diverger.
 */
@Module({
  imports: [TypeOrmModule.forFeature([IdempotencyKey]), ExecutionReferencesModule],
  controllers: [PublicExecutionReferencesController],
  providers: [IdempotencyService, IdempotencyPurgeScheduler, MachineClientGuard],
  exports: [IdempotencyService],
})
export class PublicApiModule {}
