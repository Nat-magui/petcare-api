import type { Request } from 'express';

export interface AuthenticatedUser {
  userId: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

export interface AccessTokenPayload {
  sub: string;
}
