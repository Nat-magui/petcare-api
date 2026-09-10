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
} as const;
