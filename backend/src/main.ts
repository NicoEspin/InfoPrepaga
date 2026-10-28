import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  app.use(helmet());
  app.enableShutdownHooks();

  app.enableCors({
    origin: configService.get<string>('corsOrigin'),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('NestJS RBAC Starter')
    .setDescription(
      'Production-oriented NestJS starter with JWT auth, refresh tokens, RBAC, Prisma, and PostgreSQL.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  if (configService.get<string>('nodeEnv') !== 'production') {
    SwaggerModule.setup('docs', app, document);
  }

  const port = configService.get<number>('port') ?? 3001;
  await app.listen(port);
}

void bootstrap();
