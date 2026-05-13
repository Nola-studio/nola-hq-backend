import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';

import { NolaSdkModule } from '@nola-hq/nola-sdk';

import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { ManifestModule } from './manifest/manifest.module';
import { HqConfigModule } from './config/hq-config.module';
import { HqConfigService } from './config/hq-config.service';
import { AuthModule } from './auth/auth.module';
import { CountriesModule } from './countries/countries.module';
import { AppsModule } from './apps/apps.module';
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
import { DirectoryModule } from './directory/directory.module';

import { entities } from './entities';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('DATABASE_URL');
        if (url) {
          // Postgres en prod (Railway). SSL désactivé sur le réseau privé
          // Railway (`*.railway.internal`) ; sinon SSL sans vérif. de chaîne
          // (certif managé Railway).
          const isInternal = /\.railway\.internal/.test(url);
          return {
            type: 'postgres' as const,
            url,
            entities,
            synchronize: true,
            logging: false,
            ssl: isInternal ? false : { rejectUnauthorized: false },
          };
        }
        return {
          type: 'sqlite' as const,
          database: config.get<string>('DB_PATH') ?? './data/nola.sqlite',
          entities,
          synchronize: true,
          logging: false,
        };
      },
    }),
    ManifestModule,
    HqConfigModule,
    NolaSdkModule.forRootAsync({
      imports: [HqConfigModule],
      inject: [HqConfigService],
      useFactory: (config: HqConfigService) => config.nola(),
    }),
    AuthModule,
    CountriesModule,
    AppsModule,
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
    DirectoryModule,
  ],
  // JwtAuthGuard est fourni par AuthModule (qui l'exporte). On le branche ici
  // comme guard global avec `useExisting` pour partager la même instance.
  providers: [{ provide: APP_GUARD, useExisting: JwtAuthGuard }],
})
export class AppModule {}
