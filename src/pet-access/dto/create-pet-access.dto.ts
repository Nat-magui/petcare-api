import { IsEmail, IsEnum, IsString } from 'class-validator';
import { PetAccessRole } from '../../generated/prisma/client.js';

export class CreatePetAccessDto {
  @IsString({
    message: 'Ingresá un email válido para compartir el acceso.',
  })
  @IsEmail(
    {},
    { message: 'Ingresá un email válido para compartir el acceso.' },
  )
  email: string;

  @IsEnum(PetAccessRole, {
    message: 'El rol debe ser OWNER, CAREGIVER o VIEWER.',
  })
  role: PetAccessRole;
}
