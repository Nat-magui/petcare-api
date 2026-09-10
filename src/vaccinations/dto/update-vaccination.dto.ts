import {
  IsDateString,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class UpdateVaccinationDto {
  @ApiPropertyOptional({
    description: 'Si se omite, conserva el nombre actual.',
    minLength: 2,
    maxLength: 120,
    example: 'Rabies',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(2, 120, {
    message: 'El nombre de la vacuna debe tener entre 2 y 120 caracteres.',
  })
  vaccineName?: string;

  @ApiPropertyOptional({
    description: 'Si se omite, conserva la fecha actual.',
    type: String,
    format: 'date',
    example: '2026-08-15',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @Matches(BUSINESS_DATE_PATTERN, {
    message: 'La fecha de aplicación debe usar el formato YYYY-MM-DD.',
  })
  @IsDateString(
    { strict: true, strictSeparator: true },
    {
      message: 'La fecha de aplicación debe usar el formato YYYY-MM-DD.',
    },
  )
  appliedAt?: string;

  @ApiPropertyOptional({
    description: 'Omitir conserva el valor; null lo limpia.',
    type: String,
    format: 'date',
    nullable: true,
    example: '2027-08-15',
  })
  @IsOptional()
  @Matches(BUSINESS_DATE_PATTERN, {
    message: 'La próxima fecha debe usar el formato YYYY-MM-DD.',
  })
  @IsDateString(
    { strict: true, strictSeparator: true },
    {
      message: 'La próxima fecha debe usar el formato YYYY-MM-DD.',
    },
  )
  nextDueAt?: string | null;

  @ApiPropertyOptional({
    description: 'Omitir conserva el valor; null lo limpia.',
    maxLength: 120,
    nullable: true,
    example: null,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120, {
    message: 'El nombre del veterinario no puede superar los 120 caracteres.',
  })
  veterinarianName?: string | null;

  @ApiPropertyOptional({
    description: 'Omitir conserva el valor; null lo limpia.',
    maxLength: 120,
    nullable: true,
    example: null,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120, {
    message: 'El nombre de la clínica no puede superar los 120 caracteres.',
  })
  clinicName?: string | null;

  @ApiPropertyOptional({
    description: 'Omitir conserva el valor; null lo limpia.',
    maxLength: 1000,
    nullable: true,
    example: null,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000, {
    message: 'Las notas no pueden superar los 1000 caracteres.',
  })
  notes?: string | null;
}
