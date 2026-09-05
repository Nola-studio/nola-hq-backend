import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import cookieParser = require('cookie-parser');
import { createMetricsMiddleware } from '@nola-studio/sdk';
import { NolaClientService } from '@nola-hq/nola-sdk';
import { AppModule } from './app.module';

async function bootstrap() {
    // `rawBody: true` conserve les octets reçus à côté du corps analysé. Les
  // webhooks GitHub en dépendent : la signature porte sur ce que GitHub a
  // envoyé, et re-sérialiser l'objet analysé donnerait d'autres octets.
  const app = await NestFactory.create(AppModule, { cors: false, rawBody: true });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api/v1', {
    // L'API publique porte déjà sa version dans son chemin — le référentiel
    // spécifie `POST /public/v1/execution-references`. Sans cette exclusion
    // elle vivrait sous `/api/v1/public/v1/…`, versionnée deux fois, et
    // l'adresse publiée ne correspondrait pas au contrat.
    exclude: ['.well-known/nola-manifest.yaml', 'public/v1/(.*)'],
  });
  app.use(cookieParser());

  // OTEL-lite metrics — wraps every request so the SDK's
  // MetricsRecorder gathers latency + 5xx flag, then publishes the
  // window snapshot on `nola.events.metrics.<service>` every 60s.
  // The HQ Health page consumes those and renders p50/p99/errors24h.
  //
  // Installed unconditionally — early requests before NATS is
  // connected are recorded in memory; the first successful flush
  // (60s after NolaClient comes up) drains the buffer.
  try {
    const nolaClient = app.get(NolaClientService);
    app.use(createMetricsMiddleware(nolaClient.getClient()));
  } catch (err) {
    logger.warn(
      `Metrics middleware not installed: ${err instanceof Error ? err.message : err}`,
    );
  }

  const isProd =
    (config.get<string>('NODE_ENV') ?? 'development') === 'production';
  const origins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (origins.length === 0 && isProd) {
    // Fail closed: never reflect every origin with credentials in prod.
    logger.error(
      'CORS_ORIGINS is empty in production — cross-origin requests are blocked. Set CORS_ORIGINS to the console URL(s).',
    );
  }
  app.enableCors({
    // CORS doit autoriser credentials=true pour que le cookie de session
    // (kelasi-style) traverse une requête cross-site. En prod, on n'autorise
    // jamais `*` : liste explicite, sinon fermé.
    origin: origins.length > 0 ? origins : isProd ? false : true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Nola Studio HQ — API')
    .setDescription(
      'Backend de la méta-plateforme Nola Studio (Kelasi, Kriver, MyCV, Stock, Vente, Verify).',
    )
    .setVersion('0.1.0')
    .addCookieAuth('nola_hq_session')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true, withCredentials: true },
  });

  const port = Number(config.get<string>('PORT') ?? 3001);
  await app.listen(port);
  logger.log(`Nola HQ backend ready at http://localhost:${port}/api/v1`);
  logger.log(`Swagger UI at http://localhost:${port}/docs`);
}

/**
 * Filet de sécurité, pas une excuse.
 *
 * Les écouteurs d'évènements démarrent en `void this.bootstrap()` : leur
 * promesse n'est attendue par personne. Une exception qui s'en échappe est un
 * rejet non traité, et Node arrête le processus — c'est ainsi qu'un refus de
 * `ensureStream` sur l'ingestion de support a emporté Nolaa HQ tout entier en
 * production, facturation et tickets compris.
 *
 * Chaque écouteur attrape désormais ses propres erreurs ; ce garde-fou est là
 * pour le prochain qu'on écrira en l'oubliant. Il journalise et laisse
 * l'application debout : une ingestion muette se répare à froid, un processus
 * mort réveille tout le monde.
 */
process.on('unhandledRejection', (reason: unknown) => {
  const logger = new Logger('UnhandledRejection');
  logger.error(
    reason instanceof Error
      ? `${reason.message}\n${reason.stack ?? ''}`
      : String(reason),
  );
});

void bootstrap();
