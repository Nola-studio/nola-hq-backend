import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';

import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { AuthModule } from './auth/auth.module';
import { CountriesModule } from './countries/countries.module';
import { AppsModule } from './apps/apps.module';
import { PlansModule } from './plans/plans.module';
import { AppModulesModule } from './app-modules/app-modules.module';
import { TeamModule } from './team/team.module';
import { TenantsModule } from './tenants/tenants.module';
import { ActivityModule } from './activity/activity.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { HealthModule } from './health/health.module';
import { TicketsModule } from './tickets/tickets.module';
import { InvoicesModule } from './invoices/invoices.module';
import { MomoModule } from './momo/momo.module';
import { DeploysModule } from './deploys/deploys.module';
import { AuditModule } from './audit/audit.module';
import { LogsModule } from './logs/logs.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { BroadcastModule } from './broadcast/broadcast.module';
import { SeedModule } from './seed/seed.module';

import { entities } from './entities';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'sqlite',
        database: config.get<string>('DB_PATH') ?? './data/nola.sqlite',
        entities,
        synchronize: true,
        logging: false,
      }),
    }),
    AuthModule,
    CountriesModule,
    AppsModule,
    PlansModule,
    AppModulesModule,
    TeamModule,
    TenantsModule,
    ActivityModule,
    PipelineModule,
    HealthModule,
    TicketsModule,
    InvoicesModule,
    MomoModule,
    DeploysModule,
    AuditModule,
    LogsModule,
    AnalyticsModule,
    BroadcastModule,
    SeedModule,
  ],
  // JwtAuthGuard est fourni par AuthModule (qui l'exporte). On le branche ici
  // comme guard global avec `useExisting` pour partager la même instance.
  providers: [{ provide: APP_GUARD, useExisting: JwtAuthGuard }],
})
export class AppModule {}
