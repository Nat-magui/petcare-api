import type { PetAccessRole } from '../generated/prisma/client.js';

export interface PetAccessResponse {
  userId: string;
  name: string;
  email: string;
  role: PetAccessRole;
  createdAt: Date;
}
