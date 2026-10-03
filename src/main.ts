import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { writeFileSync } from 'fs'
import helmet from 'helmet'
import { join } from 'path'
import { stringify } from 'yaml'
import { AppModule } from './app.module'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const configService = app.get(ConfigService)

  const nodeEnv = configService.get<string>('NODE_ENV', 'development')
  const isDevelopment = nodeEnv === 'development'

  // HSTS, X-Frame-Options, X-Content-Type-Options, referrer policy, and a
  // baseline CSP. The CSP is relaxed in development so the Swagger UI loads.
  app.use(helmet({ contentSecurityPolicy: !isDevelopment }))
  // Don't advertise the server stack.
  app.getHttpAdapter().getInstance().disable('x-powered-by')

  // Auth uses bearer tokens in the Authorization header — no cookies.
  // Fail closed: only fall back to the permissive `*` in local development.
  // Every deployed environment (staging included — it is internet-facing and
  // just as worth protecting) requires an explicit ALLOWED_ORIGINS allow-list,
  // so a missing env var never silently opens the API to every origin.
  const allowedOrigins = configService.get<string>('ALLOWED_ORIGINS')
  let corsOrigin: string | string[] | boolean
  if (allowedOrigins) {
    corsOrigin =
      allowedOrigins === '*'
        ? '*'
        : allowedOrigins.split(',').map((origin) => origin.trim())
  } else if (!isDevelopment) {
    corsOrigin = false
    console.warn(
      `ALLOWED_ORIGINS is not set in ${nodeEnv} — CORS is disabled. ` +
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

  // Maps driver-level errors (e.g. a malformed uuid) to clean 4xx responses
  // and keeps internal details out of 500 bodies.
  app.useGlobalFilters(new AllExceptionsFilter())

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

  // Browsable UI. Off by default outside local development: a public
  // /api/docs hands an attacker the entire API surface for free. Set
  // ENABLE_SWAGGER=true to turn it back on for a specific environment.
  const enableSwagger =
    configService.get<string>('ENABLE_SWAGGER', String(isDevelopment)) ===
    'true'
  if (enableSwagger) {
    SwaggerModule.setup('api/docs', app, document)
  }

  const port = configService.get<number>('SERVER_PORT', 3000)
  await app.listen(port, '0.0.0.0')
  console.log(`App started on http://localhost:${port}`)
  if (enableSwagger) {
    console.log(`API docs at  http://localhost:${port}/api/docs`)
  }
}
void bootstrap()
