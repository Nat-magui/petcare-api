import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception.js';
import { ERROR_CODE } from '../common/errors/error-code.js';
import { ERROR_MESSAGE } from '../common/errors/error-messages.js';
import { PetAccessRole, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import type { CreatePetAccessDto } from './dto/create-pet-access.dto.js';
import type { UpdatePetAccessDto } from './dto/update-pet-access.dto.js';
import type { PetAccessResponse } from './pet-access.types.js';

const MAX_SERIALIZABLE_ATTEMPTS = 3;

const petAccessResponseSelect = {
  userId: true,
  role: true,
  createdAt: true,
  user: {
    select: {
      name: true,
      email: true,
    },
  },
} satisfies Prisma.PetAccessSelect;

type StoredPetAccess = Prisma.PetAccessGetPayload<{
  select: typeof petAccessResponseSelect;
}>;

type PetAccessDatabase = Pick<Prisma.TransactionClient, 'pet' | 'petAccess'>;

@Injectable()
export class PetAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async findAll(
    requesterId: string,
    petId: string,
  ): Promise<PetAccessResponse[]> {
    await this.assertRequesterOwner(this.prisma, requesterId, petId);

    const accesses = await this.prisma.petAccess.findMany({
      where: { petId },
      select: petAccessResponseSelect,
    });

    return accesses.map((access) => this.toPetAccessResponse(access));
  }

  async create(
    requesterId: string,
    petId: string,
    createPetAccessDto: CreatePetAccessDto,
  ): Promise<PetAccessResponse> {
    await this.assertRequesterOwner(this.prisma, requesterId, petId);

    const targetUser = await this.usersService.findPublicByEmail(
      createPetAccessDto.email,
    );

    if (!targetUser) {
      throw new AppException({
        statusCode: HttpStatus.NOT_FOUND,
        code: ERROR_CODE.USER_NOT_FOUND,
        message: ERROR_MESSAGE.USER_NOT_FOUND,
      });
    }

    const existingAccess = await this.prisma.petAccess.findUnique({
      where: {
        userId_petId: {
          userId: targetUser.id,
          petId,
        },
      },
      select: { userId: true },
    });

    if (existingAccess) {
      throw this.accessExistsException();
    }

    try {
      const access = await this.prisma.petAccess.create({
        data: {
          userId: targetUser.id,
          petId,
          role: createPetAccessDto.role,
        },
        select: petAccessResponseSelect,
      });

      return this.toPetAccessResponse(access);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw this.accessExistsException();
      }

      throw error;
    }
  }

  update(
    requesterId: string,
    petId: string,
    targetUserId: string,
    updatePetAccessDto: UpdatePetAccessDto,
  ): Promise<PetAccessResponse> {
    return this.withSerializableRetry(async (transaction) => {
      await this.assertRequesterOwner(transaction, requesterId, petId);

      const targetAccess = await transaction.petAccess.findUnique({
        where: {
          userId_petId: {
            userId: targetUserId,
            petId,
          },
        },
        select: { role: true },
      });

      if (!targetAccess) {
        throw this.accessNotFoundException();
      }

      if (
        targetAccess.role === PetAccessRole.OWNER &&
        updatePetAccessDto.role !== PetAccessRole.OWNER
      ) {
        await this.assertAnotherOwnerRemains(transaction, petId);
      }

      const updatedAccess = await transaction.petAccess.update({
        where: {
          userId_petId: {
            userId: targetUserId,
            petId,
          },
        },
        data: { role: updatePetAccessDto.role },
        select: petAccessResponseSelect,
      });

      return this.toPetAccessResponse(updatedAccess);
    });
  }

  async delete(
    requesterId: string,
    petId: string,
    targetUserId: string,
  ): Promise<void> {
    await this.withSerializableRetry(async (transaction) => {
      await this.assertRequesterOwner(transaction, requesterId, petId);

      const targetAccess = await transaction.petAccess.findUnique({
        where: {
          userId_petId: {
            userId: targetUserId,
            petId,
          },
        },
        select: { role: true },
      });

      if (!targetAccess) {
        throw this.accessNotFoundException();
      }

      if (targetAccess.role === PetAccessRole.OWNER) {
        await this.assertAnotherOwnerRemains(transaction, petId);
      }

      await transaction.petAccess.delete({
        where: {
          userId_petId: {
            userId: targetUserId,
            petId,
          },
        },
        select: { userId: true },
      });
    });
  }

  private async assertRequesterOwner(
    database: PetAccessDatabase,
    requesterId: string,
    petId: string,
  ): Promise<void> {
    const pet = await database.pet.findUnique({
      where: { id: petId },
      select: { id: true },
    });

    if (!pet) {
      throw new AppException({
        statusCode: HttpStatus.NOT_FOUND,
        code: ERROR_CODE.PET_NOT_FOUND,
        message: ERROR_MESSAGE.PET_NOT_FOUND,
      });
    }

    const requesterAccess = await database.petAccess.findUnique({
      where: {
        userId_petId: {
          userId: requesterId,
          petId,
        },
      },
      select: { role: true },
    });

    if (!requesterAccess) {
      throw new AppException({
        statusCode: HttpStatus.FORBIDDEN,
        code: ERROR_CODE.PET_ACCESS_DENIED,
        message: ERROR_MESSAGE.PET_ACCESS_DENIED,
      });
    }

    if (requesterAccess.role !== PetAccessRole.OWNER) {
      throw new AppException({
        statusCode: HttpStatus.FORBIDDEN,
        code: ERROR_CODE.PET_ROLE_FORBIDDEN,
        message: ERROR_MESSAGE.PET_ROLE_FORBIDDEN,
      });
    }
  }

  private async assertAnotherOwnerRemains(
    transaction: Prisma.TransactionClient,
    petId: string,
  ): Promise<void> {
    const ownerCount = await transaction.petAccess.count({
      where: {
        petId,
        role: PetAccessRole.OWNER,
      },
    });

    if (ownerCount <= 1) {
      throw new AppException({
        statusCode: HttpStatus.CONFLICT,
        code: ERROR_CODE.PET_LAST_OWNER,
        message: ERROR_MESSAGE.PET_LAST_OWNER,
      });
    }
  }

  private async withSerializableRetry<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          !this.isSerializationConflict(error) ||
          attempt === MAX_SERIALIZABLE_ATTEMPTS
        ) {
          throw error;
        }
      }
    }

    throw new Error('Unreachable serializable transaction state');
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private isSerializationConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
    );
  }

  private accessExistsException(): AppException {
    return new AppException({
      statusCode: HttpStatus.CONFLICT,
      code: ERROR_CODE.PET_ACCESS_EXISTS,
      message: ERROR_MESSAGE.PET_ACCESS_EXISTS,
    });
  }

  private accessNotFoundException(): AppException {
    return new AppException({
      statusCode: HttpStatus.NOT_FOUND,
      code: ERROR_CODE.PET_ACCESS_NOT_FOUND,
      message: ERROR_MESSAGE.PET_ACCESS_NOT_FOUND,
    });
  }

  private toPetAccessResponse(access: StoredPetAccess): PetAccessResponse {
    return {
      userId: access.userId,
      name: access.user.name,
      email: access.user.email,
      role: access.role,
      createdAt: access.createdAt,
    };
  }
}
