import { AppError } from '../middlewares/error.middleware.js';

export const UUID_RFC_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Valida estrictamente una clave Idempotency-Key en formato UUID RFC 4122/9562
 * y la retorna normalizada en minúsculas; en caso contrario lanza 400 VALIDACION_INVALIDA.
 */
export function requireUuidIdempotencyKey(rawValue) {
  if (typeof rawValue !== 'string') {
    throw new AppError(
      400,
      'VALIDACION_INVALIDA',
      'La cabecera Idempotency-Key es obligatoria y debe ser un UUID válido.'
    );
  }
  const trimmed = rawValue.trim();
  if (!UUID_RFC_REGEX.test(trimmed)) {
    throw new AppError(
      400,
      'VALIDACION_INVALIDA',
      'La cabecera Idempotency-Key debe ser un UUID válido (RFC 4122/9562).'
    );
  }
  return trimmed.toLowerCase();
}
