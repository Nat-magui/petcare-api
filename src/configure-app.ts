import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { configureSwagger } from './common/swagger/swagger.config.js';
import { getCorsOrigin } from './config/security.config.js';

export function configureApp(
  app: INestApplication,
  configService: ConfigService,
): void {
  const allowedOrigin = getCorsOrigin(configService);

  app.use(helmet());
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      callback(null, origin === undefined || origin === allowedOrigin);
    },
  });
  app.setGlobalPrefix('api/v1');
  configureSwagger(app);
}
