import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_CODE } from '../common/errors/error-code.js';
import { PetAccessRole, Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { UsersService } from '../users/users.service.js';
import { PetAccessService } from './pet-access.service.js';

describe('PetAccessService', () => {
  const petId = 'c3b80c82-8687-45a0-a84e-07ba56c01f23';
  const requesterId = '166f8e3e-0d57-4c67-8cc3-d4c0ad6d7884';
  const targetUserId = 'f314b0f9-82ae-4608-81dd-82bd78245c62';
  const createdAt = new Date('2026-09-10T12:00:00.000Z');
  const targetUser = {
    id: targetUserId,
    name: 'Care Giver',
    email: 'caregiver@example.com',
    createdAt,
  };
  const storedAccess = {
    userId: targetUserId,
    role: PetAccessRole.CAREGIVER,
    createdAt,
    user: {
      name: targetUser.name,
      email: targetUser.email,
    },
  };

  let prisma: {
    pet: { findUnique: ReturnType<typeof vi.fn> };
    petAccess: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let usersService: { findPublicByEmail: ReturnType<typeof vi.fn> };
  let service: PetAccessService;

  beforeEach(() => {
    prisma = {
      pet: { findUnique: vi.fn() },
      petAccess: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      $transaction: vi.fn(),
    };
    prisma.$transaction.mockImplementation(
      (operation: (transaction: typeof prisma) => Promise<unknown>) =>
        operation(prisma),
    );
    usersService = { findPublicByEmail: vi.fn() };
    service = new PetAccessService(
      prisma as unknown as PrismaService,
      usersService as unknown as UsersService,
    );
  });

  function authorizeRequester(): void {
    prisma.pet.findUnique.mockResolvedValue({ id: petId });
    prisma.petAccess.findUnique.mockResolvedValueOnce({
      role: PetAccessRole.OWNER,
    });
  }

  it('lists safe PetAccess responses only after OWNER authorization', async () => {
    authorizeRequester();
    prisma.petAccess.findMany.mockResolvedValue([storedAccess]);

    await expect(service.findAll(requesterId, petId)).resolves.toEqual([
      {
        userId: targetUserId,
        name: targetUser.name,
        email: targetUser.email,
        role: PetAccessRole.CAREGIVER,
        createdAt,
      },
    ]);
    expect(prisma.petAccess.findMany).toHaveBeenCalledWith({
      where: { petId },
      select: {
        userId: true,
        role: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    });
  });

  it('does not look up a target user before requester authorization', async () => {
    prisma.pet.findUnique.mockResolvedValue({ id: petId });
    prisma.petAccess.findUnique.mockResolvedValue({
      role: PetAccessRole.CAREGIVER,
    });

    await expect(
      service.create(requesterId, petId, {
        email: targetUser.email,
        role: PetAccessRole.VIEWER,
      }),
    ).rejects.toMatchObject({
      response: { code: ERROR_CODE.PET_ROLE_FORBIDDEN },
    });
    expect(usersService.findPublicByEmail).not.toHaveBeenCalled();
  });

  it('maps a PetAccess unique-constraint race to PET_ACCESS_EXISTS', async () => {
    authorizeRequester();
    usersService.findPublicByEmail.mockResolvedValue(targetUser);
    prisma.petAccess.findUnique.mockResolvedValueOnce(null);
    prisma.petAccess.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.10.0',
      }),
    );

    await expect(
      service.create(requesterId, petId, {
        email: targetUser.email,
        role: PetAccessRole.CAREGIVER,
      }),
    ).rejects.toMatchObject({
      response: { code: ERROR_CODE.PET_ACCESS_EXISTS },
    });
  });

  it('updates inside a Serializable transaction', async () => {
    authorizeRequester();
    prisma.petAccess.findUnique.mockResolvedValueOnce({
      role: PetAccessRole.CAREGIVER,
    });
    prisma.petAccess.update.mockResolvedValue({
      ...storedAccess,
      role: PetAccessRole.VIEWER,
    });

    await service.update(requesterId, petId, targetUserId, {
      role: PetAccessRole.VIEWER,
    });

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(prisma.petAccess.update).toHaveBeenCalledOnce();
  });

  it('leaves state unchanged when an OWNER is the last OWNER', async () => {
    authorizeRequester();
    prisma.petAccess.findUnique.mockResolvedValueOnce({
      role: PetAccessRole.OWNER,
    });
    prisma.petAccess.count.mockResolvedValue(1);

    await expect(
      service.update(requesterId, petId, targetUserId, {
        role: PetAccessRole.CAREGIVER,
      }),
    ).rejects.toMatchObject({
      response: { code: ERROR_CODE.PET_LAST_OWNER },
    });
    expect(prisma.petAccess.update).not.toHaveBeenCalled();
  });

  it('retries P2034 and re-runs the complete Serializable operation', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError(
      'Transaction conflict',
      { code: 'P2034', clientVersion: '7.10.0' },
    );
    prisma.$transaction
      .mockRejectedValueOnce(conflict)
      .mockImplementationOnce(
        (operation: (transaction: typeof prisma) => Promise<unknown>) =>
          operation(prisma),
      );
    authorizeRequester();
    prisma.petAccess.findUnique.mockResolvedValueOnce({
      role: PetAccessRole.CAREGIVER,
    });
    prisma.petAccess.update.mockResolvedValue(storedAccess);

    await expect(
      service.update(requesterId, petId, targetUserId, {
        role: PetAccessRole.CAREGIVER,
      }),
    ).resolves.toBeDefined();

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  });

  it('does not map an exhausted P2034 retry to PET_LAST_OWNER', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError(
      'Transaction conflict',
      { code: 'P2034', clientVersion: '7.10.0' },
    );
    prisma.$transaction.mockRejectedValue(conflict);

    await expect(
      service.delete(requesterId, petId, targetUserId),
    ).rejects.toBe(conflict);
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });
});
