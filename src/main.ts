import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import cookieParser = require('cookie-parser');
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api/v1', {
    exclude: ['.well-known/nola-manifest.yaml'],
  });
  app.use(cookieParser());

  const origins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    // CORS doit autoriser le credentials=true pour que le cookie de session
    // (kelasi-style) puisse traverser une requête cross-site.
    origin: origins.length > 0 ? origins : true,
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

void bootstrap();
