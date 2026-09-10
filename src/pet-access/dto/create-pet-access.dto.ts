import { IsEmail, IsEnum, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PetAccessRole } from '../../generated/prisma/client.js';

export class CreatePetAccessDto {
  @ApiProperty({ format: 'email', example: 'caregiver@example.com' })
  @IsString({
    message: 'Ingresá un email válido para compartir el acceso.',
  })
  @IsEmail({}, { message: 'Ingresá un email válido para compartir el acceso.' })
  email: string;

  @ApiProperty({ enum: PetAccessRole, example: PetAccessRole.CAREGIVER })
  @IsEnum(PetAccessRole, {
    message: 'El rol debe ser OWNER, CAREGIVER o VIEWER.',
  })
  role: PetAccessRole;
}
