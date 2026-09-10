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
import { PrismaService } from '../src/prisma/prisma.service.js';

interface Session {
  accessToken: string;
  userId: string;
}

describe('Vaccination CRUD (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: Session;
  let caregiver: Session;
  let viewer: Session;
  let outsider: Session;
  let petId: string;
  let otherPetId: string;
  let vaccinationId: string;
  let otherVaccinationId: string;

  const runId = randomUUID().slice(0, 8);
  const emailPrefix = `task014-${runId}`;
  const petPrefix = `task014-${runId}`;
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

    const [pet, otherPet] = await Promise.all([
      prisma.pet.create({
        data: {
          name: `${petPrefix}-main`,
          species: Species.DOG,
          careMode: CareMode.FAMILY,
          accesses: {
            create: [
              { userId: owner.userId, role: PetAccessRole.OWNER },
              { userId: caregiver.userId, role: PetAccessRole.CAREGIVER },
              { userId: viewer.userId, role: PetAccessRole.VIEWER },
            ],
          },
        },
      }),
      prisma.pet.create({
        data: {
          name: `${petPrefix}-other`,
          species: Species.CAT,
          careMode: CareMode.FAMILY,
          accesses: {
            create: { userId: owner.userId, role: PetAccessRole.OWNER },
          },
        },
      }),
    ]);
    petId = pet.id;
    otherPetId = otherPet.id;
  });

  beforeEach(async () => {
    await prisma.vaccination.deleteMany({
      where: { petId: { in: [petId, otherPetId] } },
    });
    const [vaccination, otherVaccination] = await Promise.all([
      seedVaccination(petId, 'Rabies'),
      seedVaccination(otherPetId, 'Other Pet Vaccine'),
    ]);
    vaccinationId = vaccination.id;
    otherVaccinationId = otherVaccination.id;
  });

  afterAll(async () => {
    await prisma.pet.deleteMany({
      where: { id: { in: [petId, otherPetId] } },
    });
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

  function seedVaccination(targetPetId: string, vaccineName: string) {
    return prisma.vaccination.create({
      data: {
        petId: targetPetId,
        vaccineName,
        appliedAt: new Date('2026-01-10T00:00:00.000Z'),
        nextDueAt: new Date('2026-02-10T00:00:00.000Z'),
        veterinarianName: 'Dra. Pérez',
        clinicName: 'Clínica Central',
        notes: 'Original',
      },
    });
  }

  function authorization(session: Session): Record<string, string> {
    return { Authorization: `Bearer ${session.accessToken}` };
  }

  describe('GET list', () => {
    it.each([
      ['OWNER', () => owner],
      ['CAREGIVER', () => caregiver],
      ['VIEWER', () => viewer],
    ])('%s reads only the requested Pet vaccinations', async (_, getActor) => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/pets/${petId}/vaccinations`)
        .set(authorization(getActor()))
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        id: vaccinationId,
        petId,
        vaccineName: 'Rabies',
        appliedAt: '2026-01-10',
        nextDueAt: '2026-02-10',
      });
      expect(response.body[0].id).not.toBe(otherVaccinationId);
    });

    it('returns [] when the accessible Pet has no vaccinations', async () => {
      await prisma.vaccination.delete({ where: { id: vaccinationId } });
      const response = await request(app.getHttpServer())
        .get(`/api/v1/pets/${petId}/vaccinations`)
        .set(authorization(viewer))
        .expect(200);
      expect(response.body).toEqual([]);
    });

    it.each([
      ['outsider', () => outsider, () => petId, 403, 'PET_ACCESS_DENIED'],
      ['missing Pet', () => owner, () => randomUUID(), 404, 'PET_NOT_FOUND'],
      ['malformed Pet ID', () => owner, () => 'invalid', 400, 'INVALID_IDENTIFIER'],
    ])('rejects $label', async (_, getActor, getTargetPetId, status, code) => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/pets/${getTargetPetId()}/vaccinations`)
        .set(authorization(getActor()))
        .expect(status);
      expect(response.body).toMatchObject({ code });
    });
  });

  describe('GET detail', () => {
    it.each([
      ['OWNER', () => owner],
      ['CAREGIVER', () => caregiver],
      ['VIEWER', () => viewer],
    ])('%s reads a scoped vaccination', async (_, getActor) => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/pets/${petId}/vaccinations/${vaccinationId}`)
        .set(authorization(getActor()))
        .expect(200);
      expect(response.body).toMatchObject({ id: vaccinationId, petId });
    });

    it.each([
      ['malformed ID', 'invalid', 400, 'INVALID_IDENTIFIER'],
      ['missing vaccination', randomUUID(), 404, 'VACCINATION_NOT_FOUND'],
      ['other Pet vaccination', () => otherVaccinationId, 404, 'VACCINATION_NOT_FOUND'],
    ])('rejects $label', async (_, targetIdValue, status, code) => {
      const targetId =
        typeof targetIdValue === 'function' ? targetIdValue() : targetIdValue;
      const response = await request(app.getHttpServer())
        .get(`/api/v1/pets/${petId}/vaccinations/${targetId}`)
        .set(authorization(owner))
        .expect(status);
      expect(response.body).toMatchObject({ code });
    });
  });

  describe('PATCH', () => {
    it.each([
      ['OWNER', () => owner],
      ['CAREGIVER', () => caregiver],
    ])('%s replaces values, preserves omitted fields, and clears nullables', async (_, getActor) => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/pets/${petId}/vaccinations/${vaccinationId}`)
        .set(authorization(getActor()))
        .send({ vaccineName: 'Updated', veterinarianName: null, notes: null })
        .expect(200);

      expect(response.body).toMatchObject({
        id: vaccinationId,
        vaccineName: 'Updated',
        appliedAt: '2026-01-10',
        nextDueAt: '2026-02-10',
        veterinarianName: null,
        clinicName: 'Clínica Central',
        notes: null,
      });
    });

    it.each([
      ['VIEWER', () => viewer, 403, 'PET_ROLE_FORBIDDEN'],
      ['outsider', () => outsider, 403, 'PET_ACCESS_DENIED'],
    ])('rejects $label and leaves the row unchanged', async (_, getActor, status, code) => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/pets/${petId}/vaccinations/${vaccinationId}`)
        .set(authorization(getActor()))
        .send({ vaccineName: 'Forbidden' })
        .expect(status);
      expect(response.body).toMatchObject({ code });
      await expect(
        prisma.vaccination.findUniqueOrThrow({ where: { id: vaccinationId } }),
      ).resolves.toMatchObject({ vaccineName: 'Rabies' });
    });

    it.each([
      ['missing vaccination', () => randomUUID()],
      ['other Pet vaccination', () => otherVaccinationId],
    ])('returns VACCINATION_NOT_FOUND for $label', async (_, getTargetId) => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/pets/${petId}/vaccinations/${getTargetId()}`)
        .set(authorization(owner))
        .send({ notes: 'No update' })
        .expect(404);
      expect(response.body).toMatchObject({
        code: 'VACCINATION_NOT_FOUND',
        message: 'No se encontró la vacunación solicitada para esta mascota.',
      });
    });

    it.each([
      ['null vaccineName', { vaccineName: null }],
      ['null appliedAt', { appliedAt: null }],
      ['invalid calendar date', { appliedAt: '2026-02-31' }],
      ['timestamp date', { nextDueAt: '2026-02-10T00:00:00.000Z' }],
      ['unknown property', { extra: true }],
    ])('rejects $label with VALIDATION_ERROR', async (_, body) => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/pets/${petId}/vaccinations/${vaccinationId}`)
        .set(authorization(owner))
        .send(body)
        .expect(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it.each([
      [
        'future appliedAt',
        () => ({
          appliedAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10),
          nextDueAt: null,
        }),
        'appliedAt',
      ],
      [
        'nextDueAt before appliedAt',
        () => ({ appliedAt: '2026-01-10', nextDueAt: '2026-01-09' }),
        'nextDueAt',
      ],
      [
        'appliedAt-only invalid final state',
        () => ({ appliedAt: '2026-03-01' }),
        'nextDueAt',
      ],
      [
        'nextDueAt-only invalid final state',
        () => ({ nextDueAt: '2026-01-09' }),
        'nextDueAt',
      ],
    ])('rejects $label and preserves persisted state', async (_, getBody, field) => {
      const before = await prisma.vaccination.findUniqueOrThrow({
        where: { id: vaccinationId },
      });
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/pets/${petId}/vaccinations/${vaccinationId}`)
        .set(authorization(caregiver))
        .send(getBody())
        .expect(400);
      expect(response.body).toMatchObject({
        code: 'VACCINATION_INVALID_DATES',
        details: [expect.objectContaining({ field })],
      });
      const after = await prisma.vaccination.findUniqueOrThrow({
        where: { id: vaccinationId },
      });
      expect(after).toEqual(before);
    });
  });

  describe('DELETE', () => {
    it.each([
      ['OWNER', () => owner],
      ['CAREGIVER', () => caregiver],
    ])('%s deletes only the Vaccination and returns 204', async (_, getActor) => {
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/pets/${petId}/vaccinations/${vaccinationId}`)
        .set(authorization(getActor()))
        .expect(204);
      expect(response.text).toBe('');
      await expect(
        prisma.vaccination.findUnique({ where: { id: vaccinationId } }),
      ).resolves.toBeNull();
      await expect(
        prisma.pet.findUnique({ where: { id: petId } }),
      ).resolves.not.toBeNull();
    });

    it.each([
      ['VIEWER', () => viewer, () => vaccinationId, 403, 'PET_ROLE_FORBIDDEN'],
      ['outsider', () => outsider, () => vaccinationId, 403, 'PET_ACCESS_DENIED'],
      ['missing vaccination', () => owner, randomUUID(), 404, 'VACCINATION_NOT_FOUND'],
      [
        'other Pet vaccination',
        () => owner,
        () => otherVaccinationId,
        404,
        'VACCINATION_NOT_FOUND',
      ],
    ])('rejects $label without deleting a row', async (_, getActor, targetIdValue, status, code) => {
      const targetId =
        typeof targetIdValue === 'function' ? targetIdValue() : targetIdValue;
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/pets/${petId}/vaccinations/${targetId}`)
        .set(authorization(getActor()))
        .expect(status);
      expect(response.body).toMatchObject({ code });
      await expect(
        prisma.vaccination.findUnique({ where: { id: vaccinationId } }),
      ).resolves.not.toBeNull();
      await expect(
        prisma.vaccination.findUnique({ where: { id: otherVaccinationId } }),
      ).resolves.not.toBeNull();
    });
  });
});
