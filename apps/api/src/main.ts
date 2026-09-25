import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import fastifyCookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import { AppModule } from './app.module';
import { ensureJwtKeys } from './infra/config/keys';

async function bootstrap(): Promise<void> {
  // In development the RSA pair is generated on first boot so a fresh clone runs
  // without any manual key setup (§14: clone to running in under ten minutes).
  ensureJwtKeys();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // 4 MB: a speaking attempt sends up to 2 million base64 characters, and
    // JSON framing pushes that past a 2 MB ceiling.
    new FastifyAdapter({ trustProxy: true, bodyLimit: 4 * 1024 * 1024 }),
    { bufferLogs: false },
  );

  const config = app.get(ConfigService);
  const prefix = config.get<string>('API_PREFIX') ?? 'api/v1';
  const port = config.get<number>('PORT') ?? 4000;
  const webOrigin = config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000';

  await app.register(fastifyCookie, { secret: config.getOrThrow<string>('COOKIE_SECRET') });
  await app.register(helmet, {
    contentSecurityPolicy: false, // The API serves JSON; the web app sets its own CSP.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  app.enableCors({
    origin: [new URL(webOrigin).origin],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.setGlobalPrefix(prefix, { exclude: ['healthz', 'readyz'] });
  // Validation is done with Zod pipes per route (§11), not class-validator.
  app.enableShutdownHooks();

  const swagger = new DocumentBuilder()
    .setTitle('Sprout API')
    .setDescription('Web app tự học tiếng Anh cho người Việt')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  await app.listen({ port, host: '0.0.0.0' });
  Logger.log(`API listening on http://localhost:${port}/${prefix}`, 'Bootstrap');
  Logger.log(`OpenAPI at http://localhost:${port}/docs`, 'Bootstrap');
}

void bootstrap();
