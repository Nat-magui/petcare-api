export const ERROR_MESSAGE = {
  VALIDATION_ERROR: 'Los datos enviados no son válidos.',
  INVALID_IDENTIFIER: 'El identificador enviado no es válido.',
  INTERNAL_ERROR: 'Ocurrió un error interno. Intentá nuevamente más tarde.',
  AUTH_EMAIL_IN_USE: 'El correo electrónico ya está registrado.',
  AUTH_INVALID_CREDENTIALS: 'Las credenciales son inválidas.',
  AUTH_ACCESS_REQUIRED: 'Necesitás iniciar sesión para continuar.',
  AUTH_REFRESH_INVALID:
    'La sesión ya no puede renovarse. Iniciá sesión nuevamente.',
  USER_NOT_FOUND: 'No se encontró un usuario registrado con ese correo electrónico.',
  PET_NOT_FOUND: 'No se encontró la mascota solicitada.',
  PET_ACCESS_DENIED: 'No tenés acceso a esta mascota.',
  PET_ROLE_FORBIDDEN: 'Tu rol no permite realizar esta acción.',
  PET_INVALID_BIRTH_DATE: 'La fecha de nacimiento no puede ser futura.',
  PET_ACCESS_EXISTS: 'El usuario ya tiene acceso a esta mascota.',
  PET_ACCESS_NOT_FOUND:
    'No se encontró el acceso solicitado para esta mascota.',
  PET_LAST_OWNER: 'La mascota debe conservar al menos un OWNER.',
  VACCINATION_INVALID_DATES: 'Las fechas de vacunación no son válidas.',
} as const;
