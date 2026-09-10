import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PetAccessRole } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

interface Session {
  accessToken: string;
  userId: string;
}

describe('Vaccination creation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: Session;
  let caregiver: Session;
  let viewer: Session;
  let outsider: Session;
  let petId: string;

  const runId = randomUUID().slice(0, 8);
  const emailPrefix = `task013-${runId}`;
  const petName = `task013-${runId}`;
  const password = 'secure-password';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);

    owner = await createSession('owner');
    caregiver = await createSession('caregiver');
    viewer = await createSession('viewer');
    outsider = await createSession('outsider');

    const petResponse = await request(app.getHttpServer())
      .post('/api/v1/pets')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: petName, species: 'DOG', careMode: 'FAMILY' })
      .expect(201);
    petId = petResponse.body.id as string;

    await prisma.petAccess.createMany({
      data: [
        { petId, userId: caregiver.userId, role: PetAccessRole.CAREGIVER },
        { petId, userId: viewer.userId, role: PetAccessRole.VIEWER },
      ],
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
    await app.close();
  });

  async function createSession(label: string): Promise<Session> {
    const email = `${emailPrefix}-${label}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: label, email, password })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    return {
      accessToken: login.body.accessToken as string,
      userId: login.body.user.id as string,
    };
  }

  function validBody(overrides: Record<string, unknown> = {}) {
    return {
      vaccineName: 'Rabies',
      appliedAt: '2026-09-01',
      nextDueAt: '2027-09-01',
      veterinarianName: 'Dra. Pérez',
      clinicName: 'Clínica Veterinaria Central',
      notes: 'Primera dosis',
      ...overrides,
    };
  }

  it.each([
    ['OWNER', () => owner],
    ['CAREGIVER', () => caregiver],
  ])('%s can create a Vaccination linked to the route Pet', async (_, getActor) => {
    const actor = getActor();
    const response = await request(app.getHttpServer())
      .post(`/api/v1/pets/${petId}/vaccinations`)
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .send(validBody())
      .expect(201);

    expect(Object.keys(response.body).sort()).toEqual([
      'appliedAt',
      'clinicName',
      'createdAt',
      'id',
      'nextDueAt',
      'notes',
      'petId',
      'updatedAt',
      'vaccineName',
      'veterinarianName',
    ]);
    expect(response.body).toMatchObject({
      petId,
      vaccineName: 'Rabies',
      appliedAt: '2026-09-01',
      nextDueAt: '2027-09-01',
      veterinarianName: 'Dra. Pérez',
      clinicName: 'Clínica Veterinaria Central',
      notes: 'Primera dosis',
    });
    expect(response.body.createdAt).toEqual(expect.any(String));
    expect(response.body.updatedAt).toEqual(expect.any(String));

    const stored = await prisma.vaccination.findUniqueOrThrow({
      where: { id: response.body.id as string },
    });
    expect(stored.petId).toBe(petId);
    expect(stored.appliedAt.toISOString().slice(0, 10)).toBe('2026-09-01');
    expect(stored.nextDueAt?.toISOString().slice(0, 10)).toBe('2027-09-01');
  });

  it('persists and returns omitted nullable fields as null', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/pets/${petId}/vaccinations`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ vaccineName: 'Distemper', appliedAt: '2026-09-01' })
      .expect(201);

    expect(response.body).toMatchObject({
      petId,
      nextDueAt: null,
      veterinarianName: null,
      clinicName: null,
      notes: null,
    });
    const stored = await prisma.vaccination.findUniqueOrThrow({
      where: { id: response.body.id as string },
    });
    expect(stored.nextDueAt).toBeNull();
    expect(stored.veterinarianName).toBeNull();
    expect(stored.clinicName).toBeNull();
    expect(stored.notes).toBeNull();
  });

  it.each([
    ['VIEWER', () => viewer, 'PET_ROLE_FORBIDDEN'],
    ['outsider', () => outsider, 'PET_ACCESS_DENIED'],
  ])('rejects %s without persisting', async (_, getActor, expectedCode) => {
    const actor = getActor();
    const before = await prisma.vaccination.count({ where: { petId } });
    const response = await request(app.getHttpServer())
      .post(`/api/v1/pets/${petId}/vaccinations`)
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .send(validBody())
      .expect(403);

    expect(response.body).toMatchObject({ code: expectedCode });
    await expect(
      prisma.vaccination.count({ where: { petId } }),
    ).resolves.toBe(before);
  });

  it('returns PET_NOT_FOUND for a nonexistent Pet', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/pets/${randomUUID()}/vaccinations`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send(validBody())
      .expect(404);
    expect(response.body).toMatchObject({ code: 'PET_NOT_FOUND' });
  });

  it('returns INVALID_IDENTIFIER for malformed petId', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/pets/not-a-uuid/vaccinations')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send(validBody())
      .expect(400);
    expect(response.body).toMatchObject({ code: 'INVALID_IDENTIFIER' });
  });

  it('requires authentication', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/pets/${petId}/vaccinations`)
      .send(validBody())
      .expect(401);
    expect(response.body).toMatchObject({ code: 'AUTH_ACCESS_REQUIRED' });
  });

  it.each([
    ['missing vaccineName', { appliedAt: '2026-09-01' }],
    ['short vaccineName', validBody({ vaccineName: 'R' })],
    ['long vaccineName', validBody({ vaccineName: 'R'.repeat(121) })],
    ['missing appliedAt', { vaccineName: 'Rabies' }],
    ['impossible appliedAt', validBody({ appliedAt: '2026-02-31' })],
    [
      'timestamp appliedAt',
      validBody({ appliedAt: '2026-09-01T00:00:00.000Z' }),
    ],
    ['invalid nextDueAt', validBody({ nextDueAt: '2027/09/01' })],
    [
      'long veterinarianName',
      validBody({ veterinarianName: 'V'.repeat(121) }),
    ],
    ['long clinicName', validBody({ clinicName: 'C'.repeat(121) })],
    ['long notes', validBody({ notes: 'N'.repeat(1001) })],
    ['unknown property', validBody({ extra: true })],
    ['body petId', validBody({ petId: randomUUID() })],
  ])('rejects %s with VALIDATION_ERROR', async (_, body) => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/pets/${petId}/vaccinations`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send(body)
      .expect(400);
    expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it.each([
    ['today', () => new Date().toISOString().slice(0, 10), null],
    ['past', () => '2020-01-01', null],
    ['same nextDueAt', () => '2026-09-01', '2026-09-01'],
    ['later nextDueAt', () => '2026-09-01', '2027-09-01'],
  ])('accepts %s business-date combination', async (_, getAppliedAt, nextDueAt) => {
    await request(app.getHttpServer())
      .post(`/api/v1/pets/${petId}/vaccinations`)
      .set('Authorization', `Bearer ${caregiver.accessToken}`)
      .send(
        validBody({
          appliedAt: getAppliedAt(),
          nextDueAt,
        }),
      )
      .expect(201);
  });

  it.each([
    [
      'future appliedAt',
      () =>
        validBody({
          appliedAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10),
          nextDueAt: null,
        }),
      'appliedAt',
    ],
    [
      'nextDueAt before appliedAt',
      () => validBody({ appliedAt: '2026-09-01', nextDueAt: '2026-08-31' }),
      'nextDueAt',
    ],
  ])('rejects %s without persisting', async (_, getBody, field) => {
    const before = await prisma.vaccination.count({ where: { petId } });
    const response = await request(app.getHttpServer())
      .post(`/api/v1/pets/${petId}/vaccinations`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send(getBody())
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'VACCINATION_INVALID_DATES',
      message: 'Las fechas de vacunación no son válidas.',
      details: [expect.objectContaining({ field })],
    });
    await expect(
      prisma.vaccination.count({ where: { petId } }),
    ).resolves.toBe(before);
  });
});
