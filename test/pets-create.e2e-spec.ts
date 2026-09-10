import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import {
  CareMode,
  PetAccessRole,
  Species,
} from '../src/generated/prisma/client.js';
import { PetsService } from '../src/pets/pets.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Pet creation (e2e)', () => {
  let app: INestApplication;
  let petsService: PetsService;
  let prisma: PrismaService;

  const runId = randomUUID().slice(0, 8);
  const emailPrefix = `task010-${runId}`;
  const petNamePrefix = `task010-${runId}`;
  const password = 'secure-password';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    petsService = app.get(PetsService);
    prisma = app.get(PrismaService);
  });

  afterEach(async () => {
    await prisma.pet.deleteMany({
      where: { name: { startsWith: petNamePrefix } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const createEmail = () =>
    `${emailPrefix}-${randomUUID().slice(0, 8)}@example.com`;
  const createPetName = () =>
    `${petNamePrefix}-${randomUUID().slice(0, 8)}`;

  async function registerAndLogin() {
    const email = createEmail();
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Pet Owner', email, password })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    return login.body as {
      accessToken: string;
      user: { id: string };
    };
  }

  it('creates a pet and exactly one OWNER access atomically', async () => {
    const { accessToken, user } = await registerAndLogin();
    const name = createPetName();

    const response = await request(app.getHttpServer())
      .post('/api/v1/pets')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name,
        species: 'CAT',
        breed: null,
        birthDate: '2024-03-10',
        careMode: 'FOSTER',
        rescueOrganizationName: 'Patitas Felices',
      })
      .expect(201);

    expect(Object.keys(response.body).sort()).toEqual([
      'birthDate',
      'breed',
      'careMode',
      'createdAt',
      'id',
      'myRole',
      'name',
      'rescueOrganizationName',
      'species',
      'updatedAt',
    ]);
    expect(response.body).toMatchObject({
      name,
      species: 'CAT',
      breed: null,
      birthDate: '2024-03-10',
      careMode: 'FOSTER',
      rescueOrganizationName: 'Patitas Felices',
      myRole: 'OWNER',
    });
    expect(response.body.id).toEqual(expect.any(String));
    expect(response.body.createdAt).toEqual(expect.any(String));
    expect(response.body.updatedAt).toEqual(expect.any(String));

    const storedPet = await prisma.pet.findUniqueOrThrow({
      where: { id: response.body.id as string },
      include: { accesses: true },
    });

    expect(storedPet.name).toBe(name);
    expect(storedPet.birthDate?.toISOString().slice(0, 10)).toBe('2024-03-10');
    expect(storedPet.accesses).toEqual([
      expect.objectContaining({
        userId: user.id,
        petId: storedPet.id,
        role: PetAccessRole.OWNER,
      }),
    ]);
  });

  it('persists and returns omitted optional fields as null', async () => {
    const { accessToken } = await registerAndLogin();
    const name = createPetName();

    const response = await request(app.getHttpServer())
      .post('/api/v1/pets')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name,
        species: 'DOG',
        careMode: 'FAMILY',
      })
      .expect(201);

    expect(response.body).toMatchObject({
      name,
      breed: null,
      birthDate: null,
      rescueOrganizationName: null,
      myRole: 'OWNER',
    });

    const storedPet = await prisma.pet.findUniqueOrThrow({
      where: { id: response.body.id as string },
    });
    expect(storedPet.breed).toBeNull();
    expect(storedPet.birthDate).toBeNull();
    expect(storedPet.rescueOrganizationName).toBeNull();
  });

  it('rolls back Pet when the nested PetAccess write fails', async () => {
    const name = createPetName();

    await expect(
      petsService.create(randomUUID(), {
        name,
        species: Species.DOG,
        careMode: CareMode.FAMILY,
      }),
    ).rejects.toBeDefined();

    await expect(prisma.pet.findFirst({ where: { name } })).resolves.toBeNull();
  });

  it('rejects a future birthDate without persisting either record', async () => {
    const { accessToken, user } = await registerAndLogin();
    const name = createPetName();
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const response = await request(app.getHttpServer())
      .post('/api/v1/pets')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name,
        species: 'OTHER',
        birthDate: tomorrow,
        careMode: 'FAMILY',
      })
      .expect(400);

    expect(response.body).toEqual({
      statusCode: 400,
      code: 'PET_INVALID_BIRTH_DATE',
      error: 'Bad Request',
      message: 'La fecha de nacimiento no puede ser futura.',
    });
    await expect(prisma.pet.findFirst({ where: { name } })).resolves.toBeNull();
    await expect(
      prisma.petAccess.count({ where: { userId: user.id } }),
    ).resolves.toBe(0);
  });

  it.each([
    {
      caseName: 'an invalid calendar birthDate',
      body: () => ({
        name: createPetName(),
        species: 'CAT',
        birthDate: '2024-02-31',
        careMode: 'FAMILY',
      }),
    },
    {
      caseName: 'a birthDate containing a timestamp',
      body: () => ({
        name: createPetName(),
        species: 'CAT',
        birthDate: '2024-03-10T00:00:00.000Z',
        careMode: 'FAMILY',
      }),
    },
    {
      caseName: 'a one-character name',
      body: () => ({
        name: 'x',
        species: 'CAT',
        careMode: 'FAMILY',
      }),
    },
    {
      caseName: 'an invalid species',
      body: () => ({
        name: createPetName(),
        species: 'BIRD',
        careMode: 'FAMILY',
      }),
    },
    {
      caseName: 'an invalid careMode',
      body: () => ({
        name: createPetName(),
        species: 'CAT',
        careMode: 'SHELTER',
      }),
    },
    {
      caseName: 'an unknown property',
      body: () => ({
        name: createPetName(),
        species: 'CAT',
        careMode: 'FAMILY',
        ownerId: randomUUID(),
      }),
    },
  ])('rejects $caseName with the validation envelope', async ({ body }) => {
    const { accessToken } = await registerAndLogin();

    const response = await request(app.getHttpServer())
      .post('/api/v1/pets')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(body())
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      error: 'Bad Request',
      message: 'Los datos enviados no son válidos.',
    });
    expect(response.body.details).toEqual(expect.any(Array));
  });

  it('rejects pet creation without an access token', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/pets')
      .send({
        name: createPetName(),
        species: 'DOG',
        careMode: 'FAMILY',
      })
      .expect(401);

    expect(response.body).toEqual({
      statusCode: 401,
      code: 'AUTH_ACCESS_REQUIRED',
      error: 'Unauthorized',
      message: 'Necesitás iniciar sesión para continuar.',
    });
  });
});
