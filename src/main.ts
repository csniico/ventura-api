import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { stringify } from 'yaml'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const configService = app.get(ConfigService)

  // Auth uses bearer tokens in the Authorization header — no cookies.
  // Fail closed: only fall back to the permissive `*` outside production. In
  // production an explicit ALLOWED_ORIGINS allow-list is required, so a missing
  // env var never silently opens the API to every origin.
  const nodeEnv = configService.get<string>('NODE_ENV', 'development')
  const allowedOrigins = configService.get<string>('ALLOWED_ORIGINS')
  let corsOrigin: string | string[] | boolean
  if (allowedOrigins) {
    corsOrigin =
      allowedOrigins === '*'
        ? '*'
        : allowedOrigins.split(',').map((origin) => origin.trim())
  } else if (nodeEnv === 'production') {
    corsOrigin = false
    console.warn(
      'ALLOWED_ORIGINS is not set in production — CORS is disabled. ' +
        'Set an explicit comma-separated allow-list to permit browser clients.',
    )
  } else {
    corsOrigin = '*'
  }
  app.enableCors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  )

  // --- OpenAPI / Swagger ---
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Ventura API')
    .setDescription('Ventura backend API.')
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT access token from /auth sign-in.',
      },
      'bearer',
    )
    .build()

  const document = SwaggerModule.createDocument(app, swaggerConfig)

  // Write the spec to disk as YAML for committing / sharing with clients.
  // Skippable (WRITE_OPENAPI=false) and never fatal — e.g. a read-only or
  // non-root container filesystem must not crash startup over a dev artifact.
  if (configService.get<string>('WRITE_OPENAPI', 'true') !== 'false') {
    try {
      writeFileSync(join(process.cwd(), 'openapi.yaml'), stringify(document))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`Could not write openapi.yaml: ${message}`)
    }
  }

  // Browsable UI.
  SwaggerModule.setup('api/docs', app, document)

  const port = configService.get<number>('SERVER_PORT', 3000)
  await app.listen(port, '0.0.0.0')
  console.log(`App started on http://localhost:${port}`)
  console.log(`API docs at  http://localhost:${port}/api/docs`)
}
void bootstrap()
