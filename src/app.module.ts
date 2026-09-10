import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { ApiExceptionFilter } from './common/errors/api-exception.filter.js';
import { createValidationPipe } from './common/pipes/validation.pipe.js';
import {
  getGlobalThrottleLimit,
  getGlobalThrottleTtl,
} from './config/security.config.js';
import { HealthModule } from './health/health.module.js';
import { PetAccessModule } from './pet-access/pet-access.module.js';
import { PetsModule } from './pets/pets.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { VaccinationsModule } from './vaccinations/vaccinations.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          name: 'default',
          ttl: getGlobalThrottleTtl(configService),
          limit: getGlobalThrottleLimit(configService),
        },
      ],
    }),
    AuthModule,
    HealthModule,
    PetAccessModule,
    PetsModule,
    PrismaModule,
    VaccinationsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      useFactory: createValidationPipe,
    },
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
