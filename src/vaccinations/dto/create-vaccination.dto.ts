import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreateVaccinationDto {
  @IsString({ message: 'El nombre de la vacuna es obligatorio.' })
  @IsNotEmpty({ message: 'El nombre de la vacuna es obligatorio.' })
  @Length(2, 120, {
    message: 'El nombre de la vacuna debe tener entre 2 y 120 caracteres.',
  })
  vaccineName: string;

  @Matches(BUSINESS_DATE_PATTERN, {
    message: 'La fecha de aplicación debe usar el formato YYYY-MM-DD.',
  })
  @IsDateString(
    { strict: true, strictSeparator: true },
    {
      message: 'La fecha de aplicación debe usar el formato YYYY-MM-DD.',
    },
  )
  appliedAt: string;

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

  @IsOptional()
  @IsString()
  @MaxLength(120, {
    message: 'El nombre del veterinario no puede superar los 120 caracteres.',
  })
  veterinarianName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120, {
    message: 'El nombre de la clínica no puede superar los 120 caracteres.',
  })
  clinicName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000, {
    message: 'Las notas no pueden superar los 1000 caracteres.',
  })
  notes?: string | null;
}
