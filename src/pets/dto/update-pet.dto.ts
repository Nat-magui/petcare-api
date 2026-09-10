import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { CareMode, Species } from '../../generated/prisma/client.js';

const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class UpdatePetDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: 'El nombre de la mascota es obligatorio.' })
  @IsNotEmpty({ message: 'El nombre de la mascota es obligatorio.' })
  @Length(2, 80, {
    message: 'El nombre de la mascota debe tener entre 2 y 80 caracteres.',
  })
  name?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(Species, {
    message: 'La especie debe ser DOG, CAT u OTHER.',
  })
  species?: Species;

  @IsOptional()
  @IsString()
  @MaxLength(80, {
    message: 'La raza no puede superar los 80 caracteres.',
  })
  breed?: string | null;

  @IsOptional()
  @Matches(BUSINESS_DATE_PATTERN, {
    message: 'La fecha de nacimiento debe usar el formato YYYY-MM-DD.',
  })
  @IsDateString(
    { strict: true, strictSeparator: true },
    {
      message: 'La fecha de nacimiento debe usar el formato YYYY-MM-DD.',
    },
  )
  birthDate?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(CareMode, {
    message: 'El modo de cuidado debe ser FAMILY o FOSTER.',
  })
  careMode?: CareMode;

  @IsOptional()
  @IsString()
  @MaxLength(120, {
    message: 'El nombre de la organización no puede superar los 120 caracteres.',
  })
  rescueOrganizationName?: string | null;
}
