import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from './users.service.js';
import { authUserSelect, publicUserSelect } from './users.types.js';

describe('UsersService', () => {
  const createdAt = new Date('2026-09-09T12:00:00.000Z');
  const publicUser = {
    id: '166f8e3e-0d57-4c67-8cc3-d4c0ad6d7884',
    name: 'Maga',
    email: 'maga@example.com',
    createdAt,
  };
  const authUser = {
    ...publicUser,
    passwordHash: 'password-hash',
    refreshTokenHash: 'refresh-token-hash',
  };

  let prisma: {
    user: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    };
    service = new UsersService(prisma as unknown as PrismaService);
  });

  it('normalizes email before querying', async () => {
    prisma.user.findUnique.mockResolvedValue(authUser);

    await expect(service.findByEmail('MAGA@EXAMPLE.COM')).resolves.toEqual(
      authUser,
    );
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'maga@example.com' },
      select: authUserSelect,
    });
  });

  it('normalizes email and returns only public fields when creating', async () => {
    prisma.user.create.mockResolvedValue(publicUser);

    const result = await service.create({
      name: 'Maga',
      email: 'MAGA@EXAMPLE.COM',
      passwordHash: 'password-hash',
    });

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        name: 'Maga',
        email: 'maga@example.com',
        passwordHash: 'password-hash',
      },
      select: publicUserSelect,
    });
    expect(result).toEqual(publicUser);
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('refreshTokenHash');
  });

  it('finds by id using only the public projection', async () => {
    prisma.user.findUnique.mockResolvedValue(publicUser);

    const result = await service.findById(publicUser.id);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: publicUser.id },
      select: publicUserSelect,
    });
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('refreshTokenHash');
  });

  it('finds auth state by id using the internal auth projection', async () => {
    prisma.user.findUnique.mockResolvedValue(authUser);

    await expect(service.findAuthById(publicUser.id)).resolves.toEqual(
      authUser,
    );
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: publicUser.id },
      select: authUserSelect,
    });
  });

  it('returns null when a user is not found', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.findById(publicUser.id)).resolves.toBeNull();
  });

  it('persists the supplied refresh-token hash', async () => {
    prisma.user.update.mockResolvedValue({ id: publicUser.id });

    await expect(
      service.updateRefreshTokenHash(publicUser.id, 'new-refresh-hash'),
    ).resolves.toBeUndefined();
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: publicUser.id },
      data: { refreshTokenHash: 'new-refresh-hash' },
      select: { id: true },
    });
  });

  it('clears the persisted refresh-token hash', async () => {
    prisma.user.update.mockResolvedValue({ id: publicUser.id });

    await expect(
      service.clearRefreshTokenHash(publicUser.id),
    ).resolves.toBeUndefined();
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: publicUser.id },
      data: { refreshTokenHash: null },
      select: { id: true },
    });
  });
});
