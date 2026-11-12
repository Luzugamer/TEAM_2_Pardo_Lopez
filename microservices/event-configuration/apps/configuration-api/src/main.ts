import { NestFactory } from '@nestjs/core';
import { INestApplication, ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { ProblemDetailsFilter } from './shared/errors/problem-details.filter';
import { generateUuidV7 } from './shared/crypto/uuidv7';

const LOCAL_PERMISSIVE_ENVS = new Set(['development', 'test']);

export function parseAllowedOrigins(rawOrigins: string | undefined): string[] {
  if (!rawOrigins) return [];
  return rawOrigins
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin.length > 0);
}

export function resolveCorsOrigin(
  env: NodeJS.ProcessEnv = process.env,
  logger?: Pick<Logger, 'warn'>,
): boolean | string[] {
  const configuredOrigins = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);
  if (configuredOrigins.length > 0) {
    return configuredOrigins;
  }

  const nodeEnv = env.NODE_ENV ?? '';
  if (LOCAL_PERMISSIVE_ENVS.has(nodeEnv)) {
    return true;
  }

  logger?.warn(
    `CORS_ALLOWED_ORIGINS is not set in NODE_ENV='${nodeEnv || 'undefined'}'. Browser cross-origin requests are blocked (origin: false).`,
  );
  return false;
}

export function isSwaggerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const nodeEnv = env.NODE_ENV ?? '';
  if (nodeEnv === 'production') {
    return false;
  }
  if (env.SWAGGER_ENABLED === 'false') {
    return false;
  }
  if (env.SWAGGER_ENABLED === 'true') {
    return true;
  }
  return LOCAL_PERMISSIVE_ENVS.has(nodeEnv);
}

export function configureApp(
  app: INestApplication,
  env: NodeJS.ProcessEnv = process.env,
  logger: Logger = new Logger('Bootstrap'),
): void {
  app.enableShutdownHooks();

  app.use((request: Request, response: Response, next: NextFunction) => {
    const suppliedId = request.header('x-request-id');
    const isUuid =
      suppliedId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(suppliedId);
    const requestId = isUuid && suppliedId ? suppliedId : generateUuidV7();
    request.headers['x-request-id'] = requestId;
    response.setHeader('X-Request-Id', requestId);
    next();
  });

  // Global prefix for Configuration API v1
  app.setGlobalPrefix('configuration/v1');

  // RFC 7807 / RFC 9457 Problem Details Exception Filter
  app.useGlobalFilters(new ProblemDetailsFilter());

  // Input Validation with class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Enable CORS with strict environment policy
  app.enableCors({
    origin: resolveCorsOrigin(env, logger),
    exposedHeaders: ['ETag', 'Idempotency-Key', 'Content-Type', 'X-Request-Id'],
  });

  // Mount OpenAPI/Swagger only when explicitly allowed outside production
  if (isSwaggerEnabled(env)) {
    const config = new DocumentBuilder()
      .setTitle('Event Configuration API - Module A (Events & Publishing)')
      .setDescription('Event lifecycle, revisions, publication assembler, and outbox core')
      .setVersion('1.0.0')
      .addApiKey(
        { type: 'apiKey', in: 'header', name: 'x-dev-actor', description: 'Development fixtures only' },
        'DevActor',
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('configuration/v1/docs', app, document);
  }
}

export async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  configureApp(app, process.env, logger);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`Configuration API running at http://localhost:${port}/configuration/v1`);
  if (isSwaggerEnabled(process.env)) {
    logger.log(`OpenAPI documentation available at http://localhost:${port}/configuration/v1/docs`);
  }
}

if (require.main === module) {
  void bootstrap();
}

