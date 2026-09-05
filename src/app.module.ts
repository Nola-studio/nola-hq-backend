import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { NolaSdkModule } from '@nola-hq/nola-sdk';

import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { HqRolesGuard } from './common/auth/hq-roles.guard';
import { AuditInterceptor } from './audit/audit.interceptor';
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
import { IamModule } from './iam/iam.module';
import { PushModule } from './push/push.module';
import { PlansModule } from './plans/plans.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { NotificationsModule } from './notifications/notifications.module';
import { KelasiProxyModule } from './kelasi-proxy/kelasi-proxy.module';
import { AssistModule } from './assist/assist.module';
import { ModulesModule } from './modules/modules.module';
import { InfraModule } from './infra/infra.module';
import { RoadmapModule } from './roadmap/roadmap.module';
import { StudioModule } from './studio/studio.module';
import { GithubModule } from './github/github.module';
import { WorkItemsModule } from './work-items/work-items.module';
import { BusinessModule } from './business/business.module';
import { VerifyModule } from './verify/verify.module';
import { CompanyModule } from './company/company.module';
import { DomainsModule } from './domains/domains.module';
import { ExecutionReferencesModule } from './execution-references/execution-references.module';
import { PublicApiModule } from './public-api/public-api.module';
import { SlaModule } from './sla/sla.module';

import { entities } from './entities';
import { validate } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
    // Baseline rate limiting — 120 req/min/IP across the API. Sensitive
    // routes (login) tighten this with @Throttle. Blunts brute-force +
    // accidental client loops.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    // Global cron registry — currently only Studio's due-soon reminder uses it.
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('DATABASE_URL');
        if (url) {
          // Postgres en prod (Railway). SSL désactivé sur le réseau privé
          // Railway (`*.railway.internal`) et en local (loopback) ; sinon SSL
          // sans vérif. de chaîne (certif managé Railway).
          //
          // Le cas loopback est indispensable pour développer sur un Postgres
          // local : une installation standard n'active pas SSL, et forcer
          // `ssl` faisait échouer la connexion avec « The server does not
          // support SSL connections ». Le trafic ne quitte pas la machine.
          const isInternal =
            /\.railway\.internal/.test(url) ||
            /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
          return {
            type: 'postgres' as const,
            url,
            entities,
            // Prod schema is migration-driven. `synchronize` is OFF so TypeORM
            // never auto-alters/drops columns at boot; `migrationsRun` applies
            // pending migrations (the baseline creates the full schema on a
            // fresh DB). Generate new ones with `bun run migration:generate`.
            migrations: [`${__dirname}/migrations/*.{js,ts}`],
            synchronize: false,
            migrationsRun: true,
            logging: false,
            ssl: isInternal ? false : { rejectUnauthorized: false },
          };
        }
        // SQLite dev: no production data to protect → keep auto-sync, no
        // migrations (the Postgres baseline is not SQLite-compatible anyway).
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
    IamModule,
    PushModule,
    PlansModule,
    SubscriptionsModule,
    NotificationsModule,
    KelasiProxyModule,
    AssistModule,
    ModulesModule,
    RoadmapModule,
    StudioModule,
    GithubModule,
    WorkItemsModule,
    BusinessModule,
    VerifyModule,
    CompanyModule,
    DomainsModule,
    ExecutionReferencesModule,
    PublicApiModule,
    InfraModule,
    SlaModule,
  ],
  // Guards globaux dans l'ordre de chaîne :
  //   1. JwtAuthGuard — hydrate `req.user` depuis la session.
  //   2. HqRolesGuard — fait respecter `@HqRoles(...)` sur les routes
  //      mutantes. Routes sans décorateur passent sans contrôle de rôle.
  //
  // Interceptor global :
  //   - AuditInterceptor — capture chaque POST/PATCH/PUT/DELETE
  //     (succès ou erreur) et persiste un audit trail en local + sur
  //     JetStream (`nola.events.nola.audit.hq.*`).
  providers: [
    // Throttler runs first so rate limiting applies even to unauthenticated
    // requests (login brute-force).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useClass: HqRolesGuard },
    { provide: APP_INTERCEPTOR, useExisting: AuditInterceptor },
  ],
})
export class AppModule {}
