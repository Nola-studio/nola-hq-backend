import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NolaSdkModule } from '@nola-hq/nola-sdk';
import { AuditEntry } from './audit.entity';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditInterceptor } from './audit.interceptor';

/**
 * AuditModule — wires both the read path (controller → TypeORM repo)
 * and the write path (interceptor that captures every mutating HTTP
 * call). The interceptor is registered globally in `app.module.ts`
 * via `APP_INTERCEPTOR` so it covers every controller.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AuditEntry]), NolaSdkModule],
  controllers: [AuditController],
  providers: [AuditService, AuditInterceptor],
  exports: [AuditService, AuditInterceptor],
})
export class AuditModule {}
