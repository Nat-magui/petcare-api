import type { CareMode, Species } from '../generated/prisma/client.js';

export interface PetResponse {
  id: string;
  name: string;
  species: Species;
  breed: string | null;
  birthDate: string | null;
  careMode: CareMode;
  rescueOrganizationName: string | null;
  myRole: 'OWNER';
  createdAt: Date;
  updatedAt: Date;
}
