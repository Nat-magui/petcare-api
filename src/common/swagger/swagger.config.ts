import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  ApiErrorDetailDto,
  ApiErrorResponseDto,
  HealthResponseDto,
  LoginResponseDto,
  PetAccessResponseDto,
  PetResponseDto,
  PublicUserResponseDto,
  RefreshResponseDto,
  VaccinationResponseDto,
} from './api-response.dto.js';

export const SWAGGER_UI_PATH = 'api/docs';
export const SWAGGER_JSON_PATH = 'api/docs-json';
export const SWAGGER_BEARER_AUTH = 'bearerAuth';

export function configureSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('PetCare API')
    .setDescription(
      'API REST para gestión compartida de mascotas, accesos y vacunaciones.',
    )
    .setVersion('1.0')
    .addTag('health')
    .addTag('auth')
    .addTag('pets')
    .addTag('pet-access')
    .addTag('vaccinations')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Access JWT obtenido mediante POST /api/v1/auth/login.',
      },
      SWAGGER_BEARER_AUTH,
    )
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    extraModels: [
      HealthResponseDto,
      PublicUserResponseDto,
      LoginResponseDto,
      RefreshResponseDto,
      PetResponseDto,
      PetAccessResponseDto,
      VaccinationResponseDto,
      ApiErrorDetailDto,
      ApiErrorResponseDto,
    ],
  });

  SwaggerModule.setup(SWAGGER_UI_PATH, app, document, {
    jsonDocumentUrl: SWAGGER_JSON_PATH,
    swaggerOptions: {
      persistAuthorization: true,
    },
  });
}
