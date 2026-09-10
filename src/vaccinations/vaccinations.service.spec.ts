import { HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_CODE } from '../common/errors/error-code.js';
import { ERROR_MESSAGE } from '../common/errors/error-messages.js';
import { PetAccessRole } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { VaccinationsService } from './vaccinations.service.js';

describe('VaccinationsService', () => {
  const requesterId = '166f8e3e-0d57-4c67-8cc3-d4c0ad6d7884';
  const petId = 'c3b80c82-8687-45a0-a84e-07ba56c01f23';
  const vaccinationId = 'cae5e65f-c346-4a29-b8a1-84ff34ecf6e0';
  const createdAt = new Date('2026-09-10T12:00:00.000Z');
  const storedVaccination = {
    id: vaccinationId,
    petId,
    vaccineName: 'Rabies',
    appliedAt: new Date('2026-09-01T00:00:00.000Z'),
    nextDueAt: new Date('2027-09-01T00:00:00.000Z'),
    veterinarianName: 'Dra. Pérez',
    clinicName: 'Clínica Veterinaria Central',
    notes: 'Primera dosis',
    createdAt,
    updatedAt: createdAt,
  };

  let prisma: {
    pet: { findUnique: ReturnType<typeof vi.fn> };
    petAccess: { findUnique: ReturnType<typeof vi.fn> };
    vaccination: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
  };
  let service: VaccinationsService;

  beforeEach(() => {
    prisma = {
      pet: { findUnique: vi.fn().mockResolvedValue({ id: petId }) },
      petAccess: {
        findUnique: vi.fn().mockResolvedValue({ role: PetAccessRole.OWNER }),
      },
      vaccination: {
        create: vi.fn().mockResolvedValue(storedVaccination),
        findMany: vi.fn().mockResolvedValue([storedVaccination]),
        findFirst: vi.fn().mockResolvedValue(storedVaccination),
        update: vi.fn().mockResolvedValue(storedVaccination),
        delete: vi.fn().mockResolvedValue({ id: vaccinationId }),
      },
    };
    service = new VaccinationsService(prisma as unknown as PrismaService);
  });

  it.each([PetAccessRole.OWNER, PetAccessRole.CAREGIVER])(
    'allows %s to create and maps the response',
    async (role) => {
      prisma.petAccess.findUnique.mockResolvedValue({ role });

      const result = await service.create(requesterId, petId, {
        vaccineName: 'Rabies',
        appliedAt: '2026-09-01',
        nextDueAt: '2027-09-01',
        veterinarianName: 'Dra. Pérez',
        clinicName: 'Clínica Veterinaria Central',
        notes: 'Primera dosis',
      });

      expect(prisma.vaccination.create).toHaveBeenCalledWith({
        data: {
          petId,
          vaccineName: 'Rabies',
          appliedAt: new Date('2026-09-01T00:00:00.000Z'),
          nextDueAt: new Date('2027-09-01T00:00:00.000Z'),
          veterinarianName: 'Dra. Pérez',
          clinicName: 'Clínica Veterinaria Central',
          notes: 'Primera dosis',
        },
        select: expect.any(Object),
      });
      expect(result).toEqual({
        ...storedVaccination,
        appliedAt: '2026-09-01',
        nextDueAt: '2027-09-01',
      });
    },
  );

  it('resolves Pet existence before requester access', async () => {
    prisma.pet.findUnique.mockResolvedValue(null);

    await expect(
      service.create(requesterId, petId, {
        vaccineName: 'Rabies',
        appliedAt: '2026-09-01',
      }),
    ).rejects.toMatchObject({
      response: { code: ERROR_CODE.PET_NOT_FOUND },
    });
    expect(prisma.petAccess.findUnique).not.toHaveBeenCalled();
    expect(prisma.vaccination.create).not.toHaveBeenCalled();
  });

  it('rejects a requester without PetAccess before persistence', async () => {
    prisma.petAccess.findUnique.mockResolvedValue(null);

    await expect(
      service.create(requesterId, petId, {
        vaccineName: 'Rabies',
        appliedAt: '2026-09-01',
      }),
    ).rejects.toMatchObject({
      response: { code: ERROR_CODE.PET_ACCESS_DENIED },
    });
    expect(prisma.vaccination.create).not.toHaveBeenCalled();
  });

  it('rejects VIEWER before validating business dates or persisting', async () => {
    prisma.petAccess.findUnique.mockResolvedValue({
      role: PetAccessRole.VIEWER,
    });

    await expect(
      service.create(requesterId, petId, {
        vaccineName: 'Rabies',
        appliedAt: '9999-01-01',
      }),
    ).rejects.toMatchObject({
      response: { code: ERROR_CODE.PET_ROLE_FORBIDDEN },
    });
    expect(prisma.vaccination.create).not.toHaveBeenCalled();
  });

  it('rejects future appliedAt with the canonical date error', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    await expect(
      service.create(requesterId, petId, {
        vaccineName: 'Rabies',
        appliedAt: tomorrow,
      }),
    ).rejects.toMatchObject({
      response: {
        statusCode: HttpStatus.BAD_REQUEST,
        code: ERROR_CODE.VACCINATION_INVALID_DATES,
        message: ERROR_MESSAGE.VACCINATION_INVALID_DATES,
        details: [
          {
            field: 'appliedAt',
            message: 'La fecha de aplicación no puede ser futura.',
          },
        ],
      },
    });
    expect(prisma.vaccination.create).not.toHaveBeenCalled();
  });

  it('rejects nextDueAt before appliedAt without persistence', async () => {
    await expect(
      service.create(requesterId, petId, {
        vaccineName: 'Rabies',
        appliedAt: '2026-09-01',
        nextDueAt: '2026-08-31',
      }),
    ).rejects.toMatchObject({
      response: {
        code: ERROR_CODE.VACCINATION_INVALID_DATES,
        details: [{ field: 'nextDueAt' }],
      },
    });
    expect(prisma.vaccination.create).not.toHaveBeenCalled();
  });

  it('persists omitted nullable values as null', async () => {
    prisma.vaccination.create.mockResolvedValue({
      ...storedVaccination,
      nextDueAt: null,
      veterinarianName: null,
      clinicName: null,
      notes: null,
    });

    const result = await service.create(requesterId, petId, {
      vaccineName: 'Rabies',
      appliedAt: '2026-09-01',
    });

    expect(prisma.vaccination.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          petId,
          nextDueAt: null,
          veterinarianName: null,
          clinicName: null,
          notes: null,
        }),
      }),
    );
    expect(result).toMatchObject({
      nextDueAt: null,
      veterinarianName: null,
      clinicName: null,
      notes: null,
    });
  });

  it.each([
    PetAccessRole.OWNER,
    PetAccessRole.CAREGIVER,
    PetAccessRole.VIEWER,
  ])('allows %s to list only vaccinations for the requested Pet', async (role) => {
    prisma.petAccess.findUnique.mockResolvedValue({ role });

    await expect(service.findAll(requesterId, petId)).resolves.toEqual([
      {
        ...storedVaccination,
        appliedAt: '2026-09-01',
        nextDueAt: '2027-09-01',
      },
    ]);
    expect(prisma.vaccination.findMany).toHaveBeenCalledWith({
      where: { petId },
      select: expect.any(Object),
    });
  });

  it('returns an empty vaccination list', async () => {
    prisma.vaccination.findMany.mockResolvedValue([]);

    await expect(service.findAll(requesterId, petId)).resolves.toEqual([]);
  });

  it('scopes vaccination detail by both vaccinationId and petId', async () => {
    await expect(
      service.findOne(requesterId, petId, vaccinationId),
    ).resolves.toMatchObject({ id: vaccinationId, petId });
    expect(prisma.vaccination.findFirst).toHaveBeenCalledWith({
      where: { id: vaccinationId, petId },
      select: expect.any(Object),
    });
  });

  it('returns VACCINATION_NOT_FOUND for a missing or cross-Pet vaccination', async () => {
    prisma.vaccination.findFirst.mockResolvedValue(null);

    await expect(
      service.findOne(requesterId, petId, vaccinationId),
    ).rejects.toMatchObject({
      response: {
        code: ERROR_CODE.VACCINATION_NOT_FOUND,
        message: ERROR_MESSAGE.VACCINATION_NOT_FOUND,
      },
    });
  });

  it('merges PATCH with persisted state and updates only supplied fields', async () => {
    prisma.vaccination.update.mockResolvedValue({
      ...storedVaccination,
      vaccineName: 'Updated Rabies',
      veterinarianName: null,
    });

    const result = await service.update(requesterId, petId, vaccinationId, {
      vaccineName: 'Updated Rabies',
      veterinarianName: null,
    });

    expect(prisma.vaccination.update).toHaveBeenCalledWith({
      where: { id: vaccinationId },
      data: { vaccineName: 'Updated Rabies', veterinarianName: null },
      select: expect.any(Object),
    });
    expect(result).toMatchObject({
      vaccineName: 'Updated Rabies',
      appliedAt: '2026-09-01',
      nextDueAt: '2027-09-01',
      veterinarianName: null,
    });
  });

  it('rejects an invalid final state caused by updating only appliedAt', async () => {
    await expect(
      service.update(requesterId, petId, vaccinationId, {
        appliedAt: '2028-01-01',
      }),
    ).rejects.toMatchObject({
      response: { code: ERROR_CODE.VACCINATION_INVALID_DATES },
    });
    expect(prisma.vaccination.update).not.toHaveBeenCalled();
  });

  it('rejects an invalid final state caused by updating only nextDueAt', async () => {
    await expect(
      service.update(requesterId, petId, vaccinationId, {
        nextDueAt: '2026-08-31',
      }),
    ).rejects.toMatchObject({
      response: {
        code: ERROR_CODE.VACCINATION_INVALID_DATES,
        details: [{ field: 'nextDueAt' }],
      },
    });
    expect(prisma.vaccination.update).not.toHaveBeenCalled();
  });

  it('returns the current response without an empty Prisma update', async () => {
    await expect(
      service.update(requesterId, petId, vaccinationId, {}),
    ).resolves.toMatchObject({ id: vaccinationId });
    expect(prisma.vaccination.update).not.toHaveBeenCalled();
  });

  it('rejects VIEWER write operations before vaccination lookup', async () => {
    prisma.petAccess.findUnique.mockResolvedValue({
      role: PetAccessRole.VIEWER,
    });

    await expect(
      service.update(requesterId, petId, vaccinationId, { notes: null }),
    ).rejects.toMatchObject({
      response: { code: ERROR_CODE.PET_ROLE_FORBIDDEN },
    });
    await expect(
      service.delete(requesterId, petId, vaccinationId),
    ).rejects.toMatchObject({
      response: { code: ERROR_CODE.PET_ROLE_FORBIDDEN },
    });
    expect(prisma.vaccination.findFirst).not.toHaveBeenCalled();
  });

  it.each([PetAccessRole.OWNER, PetAccessRole.CAREGIVER])(
    'allows %s to delete a scoped vaccination',
    async (role) => {
      prisma.petAccess.findUnique.mockResolvedValue({ role });

      await expect(
        service.delete(requesterId, petId, vaccinationId),
      ).resolves.toBeUndefined();
      expect(prisma.vaccination.findFirst).toHaveBeenCalledWith({
        where: { id: vaccinationId, petId },
        select: expect.any(Object),
      });
      expect(prisma.vaccination.delete).toHaveBeenCalledWith({
        where: { id: vaccinationId },
        select: { id: true },
      });
    },
  );
});
