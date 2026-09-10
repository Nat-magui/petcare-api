import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import type { OpenAPIObject, OperationObject } from '@nestjs/swagger';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';

type HttpMethod = 'get' | 'post' | 'patch' | 'delete';

describe('Swagger / OpenAPI (e2e)', () => {
  let app: INestApplication;
  let document: OpenAPIObject;
  let jsonStatus: number;

  function operation(path: string, method: HttpMethod): OperationObject {
    const result = document.paths[path]?.[method];
    if (!result) throw new Error(`Missing ${method.toUpperCase()} ${path}`);
    return result;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app, app.get(ConfigService));
    await app.init();

    const response = await request(app.getHttpServer()).get('/api/docs-json');
    jsonStatus = response.status;
    document = response.body as OpenAPIObject;
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the public Swagger UI and OpenAPI JSON at the exact paths', async () => {
    const ui = await request(app.getHttpServer()).get('/api/docs').expect(200);

    expect(ui.headers['content-type']).toContain('text/html');
    expect(ui.text).toContain('Swagger UI');
    expect(jsonStatus).toBe(200);
    expect(document.openapi).toMatch(/^3\./);
  });

  it('documents exactly the implemented V1 operations under the expected tags', () => {
    const expectedOperations: Record<string, HttpMethod[]> = {
      '/api/v1/health': ['get'],
      '/api/v1/auth/register': ['post'],
      '/api/v1/auth/login': ['post'],
      '/api/v1/auth/refresh': ['post'],
      '/api/v1/auth/logout': ['post'],
      '/api/v1/auth/me': ['get'],
      '/api/v1/pets': ['get', 'post'],
      '/api/v1/pets/{petId}': ['get', 'patch', 'delete'],
      '/api/v1/pets/{petId}/access': ['get', 'post'],
      '/api/v1/pets/{petId}/access/{userId}': ['patch', 'delete'],
      '/api/v1/pets/{petId}/vaccinations': ['get', 'post'],
      '/api/v1/pets/{petId}/vaccinations/{vaccinationId}': [
        'get',
        'patch',
        'delete',
      ],
    };

    expect(Object.keys(document.paths).sort()).toEqual(
      Object.keys(expectedOperations).sort(),
    );
    for (const [path, methods] of Object.entries(expectedOperations)) {
      for (const method of methods)
        expect(operation(path, method)).toBeDefined();
    }
    expect(document.tags?.map(({ name }) => name)).toEqual([
      'health',
      'auth',
      'pets',
      'pet-access',
      'vaccinations',
    ]);
  });

  it('defines bearerAuth only on private operations', () => {
    expect(document.components?.securitySchemes).toMatchObject({
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    });

    const publicOperations: Array<[string, HttpMethod]> = [
      ['/api/v1/health', 'get'],
      ['/api/v1/auth/register', 'post'],
      ['/api/v1/auth/login', 'post'],
      ['/api/v1/auth/refresh', 'post'],
      ['/api/v1/auth/logout', 'post'],
    ];
    for (const [path, method] of publicOperations) {
      expect(operation(path, method).security).toBeUndefined();
    }

    expect(operation('/api/v1/auth/me', 'get').security).toEqual([
      { bearerAuth: [] },
    ]);
    expect(operation('/api/v1/pets', 'post').security).toEqual([
      { bearerAuth: [] },
    ]);
    expect(
      operation('/api/v1/pets/{petId}/vaccinations', 'get').security,
    ).toEqual([{ bearerAuth: [] }]);
  });

  it('exposes accurate request schemas, optional PATCH fields, and enums', () => {
    expect(document.components?.schemas).toMatchObject({
      RegisterDto: {
        required: ['name', 'email', 'password'],
        properties: {
          name: { minLength: 2, maxLength: 80 },
          email: { format: 'email' },
          password: { minLength: 8, maxLength: 72, writeOnly: true },
        },
      },
      CreatePetDto: {
        required: ['name', 'species', 'careMode'],
        properties: {
          species: { enum: ['DOG', 'CAT', 'OTHER'] },
          careMode: { enum: ['FAMILY', 'FOSTER'] },
          birthDate: { format: 'date', nullable: true },
        },
      },
      CreatePetAccessDto: {
        required: ['email', 'role'],
        properties: {
          role: { enum: ['OWNER', 'CAREGIVER', 'VIEWER'] },
        },
      },
      CreateVaccinationDto: {
        required: ['vaccineName', 'appliedAt'],
        properties: {
          appliedAt: { format: 'date' },
          nextDueAt: { format: 'date', nullable: true },
        },
      },
    });

    expect(document.components?.schemas?.UpdatePetDto).not.toHaveProperty(
      'required',
    );
    expect(
      document.components?.schemas?.UpdateVaccinationDto,
    ).not.toHaveProperty('required');
    expect(document.components?.schemas?.UpdatePetAccessDto).toMatchObject({
      required: ['role'],
    });
  });

  it('documents public response DTOs, arrays, and bodyless 204 responses', () => {
    expect(document.components?.schemas).toMatchObject({
      PublicUserResponseDto: {
        required: ['id', 'name', 'email', 'createdAt'],
      },
      LoginResponseDto: {
        required: ['accessToken', 'refreshToken', 'user'],
      },
      PetResponseDto: {
        required: expect.arrayContaining(['id', 'name', 'myRole']),
      },
      PetAccessResponseDto: {
        required: ['userId', 'name', 'email', 'role', 'createdAt'],
      },
      VaccinationResponseDto: {
        required: expect.arrayContaining(['id', 'petId', 'appliedAt']),
      },
    });

    expect(operation('/api/v1/pets', 'get').responses['200']).toMatchObject({
      content: {
        'application/json': {
          schema: {
            type: 'array',
            items: { $ref: '#/components/schemas/PetResponseDto' },
          },
        },
      },
    });
    expect(
      operation('/api/v1/pets/{petId}', 'delete').responses['204'],
    ).not.toHaveProperty('content');
    expect(
      operation('/api/v1/auth/logout', 'post').responses['204'],
    ).not.toHaveProperty('content');
  });

  it('documents endpoint-specific errors without sensitive response fields', () => {
    expect(operation('/api/v1/auth/register', 'post').responses).toMatchObject({
      400: { description: 'VALIDATION_ERROR' },
      409: {
        description: 'AUTH_EMAIL_IN_USE',
        content: {
          'application/json': {
            schema: {
              properties: {
                statusCode: { example: 409 },
                code: { example: 'AUTH_EMAIL_IN_USE' },
                error: { example: 'Conflict' },
              },
            },
          },
        },
      },
      429: { description: 'RATE_LIMIT_EXCEEDED' },
      500: { description: 'INTERNAL_ERROR' },
    });
    expect(
      operation('/api/v1/pets/{petId}/access/{userId}', 'patch').responses,
    ).toMatchObject({
      400: { description: expect.stringContaining('INVALID_IDENTIFIER') },
      403: { description: expect.stringContaining('PET_ROLE_FORBIDDEN') },
      404: { description: expect.stringContaining('PET_ACCESS_NOT_FOUND') },
      409: { description: 'PET_LAST_OWNER' },
    });
    expect(
      operation('/api/v1/pets/{petId}/vaccinations/{vaccinationId}', 'patch')
        .responses,
    ).toMatchObject({
      400: {
        description: expect.stringContaining('VACCINATION_INVALID_DATES'),
      },
      404: { description: expect.stringContaining('VACCINATION_NOT_FOUND') },
    });

    const responseSchemas = [
      'PublicUserResponseDto',
      'LoginResponseDto',
      'RefreshResponseDto',
      'PetResponseDto',
      'PetAccessResponseDto',
      'VaccinationResponseDto',
    ].map((name) => document.components?.schemas?.[name]);
    const serializedResponses = JSON.stringify(responseSchemas);
    expect(serializedResponses).not.toContain('passwordHash');
    expect(serializedResponses).not.toContain('refreshTokenHash');
  });
});
