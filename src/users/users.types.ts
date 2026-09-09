import { Prisma } from '../generated/prisma/client.js';

export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export const authUserSelect = {
  id: true,
  name: true,
  email: true,
  passwordHash: true,
  refreshTokenHash: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{
  select: typeof publicUserSelect;
}>;

export type AuthUser = Prisma.UserGetPayload<{
  select: typeof authUserSelect;
}>;

export function toPublicUser(user: AuthUser): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  };
}

export interface CreateUserData {
  name: string;
  email: string;
  passwordHash: string;
}
