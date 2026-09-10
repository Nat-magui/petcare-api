import type {
  CareMode,
  PetAccessRole,
  Species,
} from '../generated/prisma/client.js';

export interface PetResponse {
  id: string;
  name: string;
  species: Species;
  breed: string | null;
  birthDate: string | null;
  careMode: CareMode;
  rescueOrganizationName: string | null;
  myRole: PetAccessRole;
  createdAt: Date;
  updatedAt: Date;
}
