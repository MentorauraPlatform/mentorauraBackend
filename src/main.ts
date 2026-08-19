import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });

  // ── Global prefix & versioning ─────────────────────────────────────────────
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // ── CORS ──────────────────────────────────────────────────────────────────
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  });

  // ── Global validation pipe ─────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,       // strip unknown properties
      forbidNonWhitelisted: true,
      transform: true,       // auto-transform payloads to DTO types
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  logger.log(`🚀 Mentoraura API running on: http://localhost:${port}/api/v1`);
}

bootstrap();
