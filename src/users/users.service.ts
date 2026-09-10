import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  authUserSelect,
  type AuthUser,
  type CreateUserData,
  publicUserSelect,
  type PublicUser,
} from './users.types.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<AuthUser | null> {
    return this.prisma.user.findUnique({
      where: { email: this.normalizeEmail(email) },
      select: authUserSelect,
    });
  }

  findById(id: string): Promise<PublicUser | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });
  }

  findPublicByEmail(email: string): Promise<PublicUser | null> {
    return this.prisma.user.findUnique({
      where: { email: this.normalizeEmail(email) },
      select: publicUserSelect,
    });
  }

  findAuthById(id: string): Promise<AuthUser | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: authUserSelect,
    });
  }

  create(data: CreateUserData): Promise<PublicUser> {
    return this.prisma.user.create({
      data: {
        name: data.name,
        email: this.normalizeEmail(data.email),
        passwordHash: data.passwordHash,
      },
      select: publicUserSelect,
    });
  }

  async updateRefreshTokenHash(
    userId: string,
    refreshTokenHash: string,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash },
      select: { id: true },
    });
  }

  async clearRefreshTokenHash(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
      select: { id: true },
    });
  }

  private normalizeEmail(email: string): string {
    return email.toLowerCase();
  }
}
