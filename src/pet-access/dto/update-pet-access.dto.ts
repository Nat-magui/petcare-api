import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PetAccessRole } from '../../generated/prisma/client.js';

export class UpdatePetAccessDto {
  @ApiProperty({ enum: PetAccessRole, example: PetAccessRole.VIEWER })
  @IsEnum(PetAccessRole, {
    message: 'El rol debe ser OWNER, CAREGIVER o VIEWER.',
  })
  role: PetAccessRole;
}
