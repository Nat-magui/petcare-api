import { IsEnum } from 'class-validator';
import { PetAccessRole } from '../../generated/prisma/client.js';

export class UpdatePetAccessDto {
  @IsEnum(PetAccessRole, {
    message: 'El rol debe ser OWNER, CAREGIVER o VIEWER.',
  })
  role: PetAccessRole;
}
