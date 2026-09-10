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
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CareMode, Species } from '../../generated/prisma/client.js';

const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class UpdatePetDto {
  @ApiPropertyOptional({
    description: 'Si se omite, conserva el nombre actual.',
    minLength: 2,
    maxLength: 80,
    example: 'Luna',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: 'El nombre de la mascota es obligatorio.' })
  @IsNotEmpty({ message: 'El nombre de la mascota es obligatorio.' })
  @Length(2, 80, {
    message: 'El nombre de la mascota debe tener entre 2 y 80 caracteres.',
  })
  name?: string;

  @ApiPropertyOptional({
    description: 'Si se omite, conserva la especie actual.',
    enum: Species,
    example: Species.DOG,
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(Species, {
    message: 'La especie debe ser DOG, CAT u OTHER.',
  })
  species?: Species;

  @ApiPropertyOptional({
    description: 'Omitir conserva el valor; null lo limpia.',
    maxLength: 80,
    nullable: true,
    example: null,
  })
  @IsOptional()
  @IsString()
  @MaxLength(80, {
    message: 'La raza no puede superar los 80 caracteres.',
  })
  breed?: string | null;

  @ApiPropertyOptional({
    description: 'Omitir conserva el valor; null lo limpia.',
    type: String,
    format: 'date',
    nullable: true,
    example: '2021-04-12',
  })
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

  @ApiPropertyOptional({
    description: 'Si se omite, conserva el modo de cuidado actual.',
    enum: CareMode,
    example: CareMode.FAMILY,
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(CareMode, {
    message: 'El modo de cuidado debe ser FAMILY o FOSTER.',
  })
  careMode?: CareMode;

  @ApiPropertyOptional({
    description: 'Omitir conserva el valor; null lo limpia.',
    maxLength: 120,
    nullable: true,
    example: null,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120, {
    message:
      'El nombre de la organización no puede superar los 120 caracteres.',
  })
  rescueOrganizationName?: string | null;
}
